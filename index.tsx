/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { DeleteIcon } from "@components/Icons";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Forms, Menu, React, TextInput, useState } from "@webpack/common";

interface FolderEntry {
    path: string;
    name: string;
}

function saveTo() {
    return (
        <Menu.MenuItem
            id="save-to"
            key="save-to"
            label="Save to..."
        ></Menu.MenuItem>
    );
}

const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    console.info("IMAGESAVETO");
    console.info(props);

    if (!props?.src) return;

    const group = findGroupChildrenByChildId("save-image", children) ?? children;
    group.push(saveTo());
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

interface FolderPathsProps {
    folderPaths: string[];
}


// Most of this component is the same as TextReplace from the Text Replace plugin,
// eternally grateful I didn't have to write an array settings component from scratch
function FolderPaths({ folderPaths }: FolderPathsProps) {
    // Handle path changes
    async function onChange(value: string, index: number) {
        // If editing the last path and it's not empty, add a new empty path
        if (index === folderPaths.length - 1 && value !== "") {
            folderPaths.push("");
        }

        // Update the path at the specified index
        folderPaths[index] = value;

        // Remove empty paths (except the last one)
        if (value === "" && index !== folderPaths.length - 1) {
            folderPaths.splice(index, 1);
        }
    }

    // Handle path deletion
    async function onClickRemove(index: number) {
        if (index === folderPaths.length - 1) return;
        folderPaths.splice(index, 1);

        // Make sure we always have at least one path (empty or not)
        if (folderPaths.length === 0) {
            folderPaths.push("");
        }
    }

    // Ensure there's always at least one path (empty or not)
    if (folderPaths.length === 0) {
        folderPaths.push("");
    }

    return (
        <>
            <Forms.FormTitle tag="h4">Folder Paths</Forms.FormTitle>
            <Flex flexDirection="column" style={{ gap: "0.5em" }}>
                {folderPaths.map((path, index) => (
                    <React.Fragment key={`path-${index}-${path}`}>
                        <Flex flexDirection="row" style={{ gap: "0.5em" }}>
                            <Input
                                placeholder="Enter folder path"
                                initialValue={path}
                                onChange={value => onChange(value, index)}
                            />
                            <Input
                                placeholder="Display name"
                                initialValue={""}
                                onChange={() => { }}
                            />
                            <Button
                                size={Button.Sizes.MIN}
                                onClick={() => onClickRemove(index)}
                                style={{
                                    background: "none",
                                    color: "var(--status-danger)",
                                    ...(index === folderPaths.length - 1
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
            const { folderPaths } = settings.use(["folderPaths"]);

            return <FolderPaths folderPaths={folderPaths} />;
        }
    },
    folderPaths: {
        default: [] as string[],
        type: OptionType.CUSTOM,
    },
});

export default definePlugin({
    name: "Erm",
    authors: [{
        name: "Cornflakes",
        id: 291579509784969217n,
    }],
    description: "Adds quick image saving options.",
    contextMenus: {
        "image-context": imageContextMenuPatch,
    },
    settings,
});
