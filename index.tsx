/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { DeleteIcon } from "@components/Icons";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Button, Forms, Menu, React, TextInput, useEffect, useState } from "@webpack/common";


const Native = VencordNative.pluginHelpers.SaveTo as PluginNative<typeof import("./native")>;

interface FolderEntry {
    path: string;
    name: string;
}

let cachedFolderEntries = [{ path: "", name: "" }];

function saveToMenu(srcUrl: string) {
    return (
        <Menu.MenuItem
            id="save-to"
            key="save-to"
            label="Save to..."
        >
            {cachedFolderEntries.map((entry, index) => (
                entry.path
                    ? <Menu.MenuItem
                        id={`save-to-${index}`}
                        key={`save-to-${index}`}
                        label={entry.name}
                        action={() => Native.saveToFolder(srcUrl, entry.path)}
                    />
                    : null
            ))}
        </Menu.MenuItem>
    );
}

// Add the Save to... option to the image context menu
const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props?.src) return;

    const group = findGroupChildrenByChildId("save-image", children) ?? children;
    group.push(saveToMenu(props.src));
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props.itemSrc) return;

    const group = findGroupChildrenByChildId("save-image", children) ?? children;
    group.push(saveToMenu(props.itemSrc));
};

// Custom Input component that only triggers onChange on blur
function Input({ initialValue, onChange, placeholder }: {
    placeholder: string;
    initialValue: string;
    onChange(value: string): void;
}) {
    const [value, setValue] = useState(initialValue);
    return (
        <TextInput
            placeholder={placeholder}
            value={value}
            onChange={setValue}
            spellCheck={false}
            onBlur={() => value !== initialValue && onChange(value)}
        />
    );
}

interface FolderEntriesProps {
    folderEntries: FolderEntry[];
    setFolderEntries(entries: FolderEntry[]): void;
}


// Most of this component is the same as TextReplace from the Text Replace plugin,
// eternally grateful I didn't have to write an array settings component from scratch
function FolderEntries({ folderEntries, setFolderEntries }: FolderEntriesProps) {

    // Like https://stackoverflow.com/a/59907288
    function basenameish(path: string) {
        let end = path.length - 1;
        while (path[end] === "/" || path[end] === "\\") end -= 1;

        const start = Math.max(path.lastIndexOf("/", end), path.lastIndexOf("\\", end));
        return path.slice(start + 1, end + 1);
    }

    // Handle path changes
    async function updatePath(path: string, index: number) {
        const updatedEntries = [...folderEntries];
        // If editing the last path and it's not empty, add a new empty entry
        if (index === folderEntries.length - 1 && path !== "") {
            updatedEntries.push({ path: "", name: "" });
        }

        // Update the path at the specified index
        // If the name is empty, use the basename
        updatedEntries[index] = {
            path,
            name: updatedEntries[index].name === "" ? basenameish(path) : updatedEntries[index].name
        };

        // Remove empty paths (except the last one)
        if (path === "" && updatedEntries[index].name === "" && index !== updatedEntries.length - 1) {
            updatedEntries.splice(index, 1);
        }

        setFolderEntries(updatedEntries);
    }

    async function updateName(name: string, index: number) {
        const updatedEntries = [...folderEntries];
        // If editing the last name and it's not empty, add a new empty entry
        if (index === updatedEntries.length - 1 && name !== "") {
            updatedEntries.push({ path: "", name: "" });
        }

        // Update the name at the specified index
        // If the name is empty, use the basename
        updatedEntries[index] = {
            path: updatedEntries[index].path,
            name: name === "" ? basenameish(updatedEntries[index].path) : name
        };

        // Remove empty paths (except the last one)
        if (name === "" && updatedEntries[index].path === "" && index !== updatedEntries.length - 1) {
            updatedEntries.splice(index, 1);
        }

        setFolderEntries(updatedEntries);
    }

    // Handle path deletion
    async function onClickRemove(index: number) {
        const updatedEntries = [...folderEntries];

        if (index === updatedEntries.length - 1) return;
        updatedEntries.splice(index, 1);

        // Make sure we always have at least one path (empty or not)
        if (updatedEntries.length === 0) {
            updatedEntries.push({ path: "", name: "" });
        }

        setFolderEntries(updatedEntries);
    }

    // Ensure there's always at least one path when created (empty or not)
    if (folderEntries.length === 0) {
        setFolderEntries([{ path: "", name: "" }]);
    }

    return (
        <>
            <Forms.FormTitle tag="h4">Folder Paths</Forms.FormTitle>
            <Flex flexDirection="column" style={{ gap: "0.5em" }}>
                {folderEntries.map((entry, index) => (
                    <React.Fragment key={`${index}-${entry.path}-${entry.name}`}>
                        <Flex flexDirection="row" style={{ gap: "0.5em" }}>
                            <Input
                                placeholder="Folder path"
                                initialValue={entry.path}
                                onChange={value => updatePath(value, index)}
                            />
                            <Input
                                placeholder="Display name"
                                initialValue={entry.name}
                                onChange={value => updateName(value, index)}
                            />
                            <Button
                                size={Button.Sizes.MIN}
                                onClick={() => onClickRemove(index)}
                                style={{
                                    background: "none",
                                    color: "var(--status-danger)",
                                    ...(index === folderEntries.length - 1
                                        ? {
                                            visibility: "hidden",
                                            pointerEvents: "none"
                                        }
                                        : {}
                                    )
                                }}
                            >
                                <DeleteIcon />
                            </Button>
                        </Flex>
                    </React.Fragment>
                ))}
            </Flex>
        </>
    );
}

export const settings = definePluginSettings({
    folderPathsComponent: {
        type: OptionType.COMPONENT,
        description: "Folder paths to save images to",
        component: ({ setValue, setError, option }) => {
            // Weird stuff to get state in the folder entries component
            const clonedFolderEntries = cachedFolderEntries.map(entry => {
                return { path: entry.path, name: entry.name };
            });
            const [saveValues, setSaveValues] = useState(clonedFolderEntries);

            useEffect(() => {
                cachedFolderEntries = saveValues.map(entry => {
                    return { path: entry.path, name: entry.name };
                });
                DataStore.set("saveToFolderEntries", cachedFolderEntries);
            }, [saveValues]);

            return <FolderEntries folderEntries={saveValues} setFolderEntries={setSaveValues} />;
        }
    },
});

export default definePlugin({
    name: "SaveTo",
    authors: [{
        name: "Cornflakes",
        id: 291579509784969217n,
    }],
    description: "Adds quick image saving options.",
    contextMenus: {
        "image-context": imageContextMenuPatch,
        "message": messageContextMenuPatch
    },
    settings,
    async start() {
        cachedFolderEntries = await DataStore.get("saveToFolderEntries") ?? [{ path: "", name: "" }];
    }
});
