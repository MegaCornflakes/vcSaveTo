/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { DeleteIcon } from "@components/Icons";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Button, Forms, Menu, React, TextInput, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.SaveTo as PluginNative<typeof import("./native")>;

interface FolderEntry {
    path: string;
    name: string;
}

function saveToMenu(srcUrl: string) {
    const { folderEntries } = settings.use(["folderEntries"]);

    return (
        <Menu.MenuItem
            id="save-to"
            key="save-to"
            label="Save to..."
        >
            {folderEntries.map((entry, index) => (
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
}


// Most of this component is the same as TextReplace from the Text Replace plugin,
// eternally grateful I didn't have to write an array settings component from scratch
function FolderEntries({ folderEntries }: FolderEntriesProps) {
    // Handle path changes
    async function updatePath(path: string, index: number) {
        // If editing the last path and it's not empty, add a new empty entry
        if (index === folderEntries.length - 1 && path !== "") {
            folderEntries.push({ path: "", name: "" });
        }

        // Update the path at the specified index
        folderEntries[index].path = path;

        // Remove empty paths (except the last one)
        if (path === "" && folderEntries[index].name === "" && index !== folderEntries.length - 1) {
            folderEntries.splice(index, 1);
        }
    }

    async function updateName(name: string, index: number) {
        // If editing the last name and it's not empty, add a new empty entry
        if (index === folderEntries.length - 1 && name !== "") {
            folderEntries.push({ path: "", name: "" });
        }

        // Update the path at the specified index
        folderEntries[index].name = name;

        // Remove empty paths (except the last one)
        if (name === "" && folderEntries[index].path === "" && index !== folderEntries.length - 1) {
            folderEntries.splice(index, 1);
        }
    }

    // Handle path deletion
    async function onClickRemove(index: number) {
        if (index === folderEntries.length - 1) return;
        folderEntries.splice(index, 1);

        // Make sure we always have at least one path (empty or not)
        if (folderEntries.length === 0) {
            folderEntries.push({ path: "", name: "" });
        }
    }

    // Ensure there's always at least one path when created (empty or not)
    if (folderEntries.length === 0) {
        folderEntries.push({ path: "", name: "" });
    }

    return (
        <>
            <Forms.FormTitle tag="h4">Folder Paths</Forms.FormTitle>
            <Flex flexDirection="column" style={{ gap: "0.5em" }}>
                {folderEntries.map((entry, index) => (
                    <React.Fragment key={`path-${index}-${entry}`}>
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
        component: () => {
            const { folderEntries } = settings.use(["folderEntries"]);

            return <FolderEntries folderEntries={folderEntries} />;
        }
    },
    folderEntries: {
        default: [{ path: "", name: "" }] as FolderEntry[],
        type: OptionType.CUSTOM,
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
});
