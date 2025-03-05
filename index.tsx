/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { Grid } from "@components/Grid";
import { DeleteIcon } from "@components/Icons";
import { openPluginModal } from "@components/PluginSettings/PluginModal";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { Button, EmojiStore, Forms, Menu, React, TextInput, Toasts, useEffect, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.SaveTo as PluginNative<typeof import("./native")>;

const StickerStore = findStoreLazy("StickersStore") as { getStickerById: (id: string) => { name: string; } | undefined; };

interface FolderEntry {
    path: string;
    name: string;
}

let cachedFolderEntries = [{ path: "", name: "" }];

// Like https://stackoverflow.com/a/59907288
function basenameish(path: string) {
    let end = path.length - 1;
    while (path[end] === "/" || path[end] === "\\") end -= 1;

    const start = Math.max(path.lastIndexOf("/", end), path.lastIndexOf("\\", end));
    return path.slice(start + 1, end + 1);
}

function saveHandler(srcUrl: string, path: string, name?: string) {
    try {
        Native.saveToFolder(srcUrl, path, name);
    } catch (e: any) {
        Toasts.show({
            message: "Failed to save: " + e.message,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId()
        });
    }
}

// Add the Save to... option to whatever context menus could have images
const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { src: string; }) => {
    console.log(props);
    if (!props?.src) return;

    const group = findGroupChildrenByChildId("save-image", children) ?? children;
    group.push(saveToMenu(props.src, ""));
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { favoriteableId: string | null; favoriteableType: string | null; itemSrc: string | null; itemSafeSrc: string | null; }) => {
    // itemSafeSrc is good for normal images/files
    let source: string | null = props.itemSafeSrc;
    let type = "";
    if (props.favoriteableType === "emoji" && props.itemSrc) {
        source = props.itemSrc.slice(0, props.itemSrc?.indexOf("?size="));
        type = "Emote";
    }
    if (props.favoriteableType === "sticker" && props.itemSrc) {
        source = props.itemSrc.slice(0, props.itemSrc?.indexOf("?size="));
        type = "Sticker";
    }

    if (!source) return;

    let group = findGroupChildrenByChildId("save-image", children);
    if (group) {
        group.push(saveToMenu(source, type, props.favoriteableId));
        return;
    }
    group = findGroupChildrenByChildId("open-native-link", children) || findGroupChildrenByChildId("devmode-copy-id", children, true);
    if (group) {
        group.unshift(<Menu.MenuSeparator key="save-to-separator" />);
        group.unshift(saveToMenu(source, type, props.favoriteableId));
        return;
    }

    children.push(saveToMenu(source, type, props.favoriteableId));
};

const userContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    console.log(props);
};

// Buncha components

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



function saveToMenu(srcUrl: string, type: string, objectId?: string | null) {
    // Put the extension on sticker/emote names
    const extension = basenameish(new URL(srcUrl).pathname).split(".").pop()?.match(/^[a-zA-Z0-9]+/)?.[0];
    let name: string | undefined;
    if (type === "Sticker" && objectId) {
        const sticker = StickerStore.getStickerById(objectId);
        name = sticker?.name;
    }
    if (type === "Emote") {
        const emote = EmojiStore.getCustomEmojiById(objectId);
        name = emote?.name;
    }
    if (name) {
        name = name.replace(" ", "_");
    }

    function onSave(path: string) {
        saveHandler(srcUrl, path, name ? name + "." + extension : undefined);
    }

    return (
        <Menu.MenuItem
            id="save-to"
            key="save-to"
            label={type ? `Save ${type} To...` : "Save To..."}
        >
            {cachedFolderEntries.length === 1 && <Menu.MenuItem id="saveto-add-folder" key="saveto-add-folder" label="Add A Folder First!" action={() => {
                openPluginModal(Vencord.Plugins.plugins.SaveTo);
            }} />}
            {cachedFolderEntries.map((entry, index) => (
                entry.path
                    ? <Menu.MenuItem
                        id={`save-to-folder-${index}`}
                        key={`save-to-folder-${index}`}
                        label={entry.name}
                        action={() => onSave(entry.path)}
                    >
                        <Menu.MenuItem id={`save-${index}`} key={`save-${index}`} label="Save" action={() => onSave(entry.path)} />
                        <Menu.MenuItem id={`save-as-${index}`} key={`save-as-${index}`} label="Save As..." action={() => {
                            openModal(props => (
                                <SaveAsModal modalProps={props} srcUrl={srcUrl} path={entry.path} defaultName={name} />
                            ));
                        }} />
                    </Menu.MenuItem>
                    : null
            ))}
        </Menu.MenuItem>
    );
}

// Save as modal component

function SaveAsModal({ modalProps, srcUrl, path, defaultName }: { modalProps: ModalProps, srcUrl: string, path: string; defaultName: string | undefined; }) {
    const fullname = basenameish(new URL(srcUrl).pathname);
    const filename = defaultName || fullname.slice(0, fullname.lastIndexOf("."));
    // Sometimes images (X embeds) have weird things after the extension
    const extension = fullname.split(".").pop()?.match(/^[a-zA-Z0-9]+/)?.[0];

    const [name, setName] = useState("");

    function onSave() {
        saveHandler(srcUrl, path, name ? name + "." + extension : fullname);
        modalProps.onClose();
    }

    return (
        <ModalRoot {...modalProps}>
            <ModalHeader>
                <Forms.FormTitle tag="h4">Save As</Forms.FormTitle>
            </ModalHeader>
            <ModalContent style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <Forms.FormTitle tag="h5">Filename (leave empty for default)</Forms.FormTitle>
                <Grid columns={2} gap="0.5em" style={{ gridTemplateColumns: "1fr auto", alignItems: "baseline" }}>
                    <TextInput placeholder={filename} value={name} onChange={setName} onKeyDown={e => {
                        if (e.key === "Enter") {
                            onSave();
                        }
                    }} />
                    <Forms.FormTitle tag="h5" style={{ textTransform: "lowercase" }}>{"." + extension}</Forms.FormTitle>
                </Grid>
            </ModalContent>
            <ModalFooter>
                <Button color={Button.Colors.BRAND} onClick={onSave}>Save</Button>
                <Button color={Button.Colors.TRANSPARENT} look={Button.Looks.LINK} onClick={() => modalProps.onClose()}>Cancel</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

// Folder entries component

interface FolderEntriesProps {
    folderEntries: FolderEntry[];
    setFolderEntries(entries: FolderEntry[]): void;
}


// Most of this component is the same as TextReplace from the Text Replace plugin,
// eternally grateful I didn't have to write an array settings component from scratch
function FolderEntries({ folderEntries, setFolderEntries }: FolderEntriesProps) {
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
                        <Grid columns={3} style={{ gap: "0.5em", gridTemplateColumns: "1fr 1fr auto" }}>
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
                        </Grid>
                    </React.Fragment>
                ))}
            </Flex>
        </>
    );
}

// Plugin definition

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
        "message": messageContextMenuPatch,
        "user-context": userContextMenuPatch
    },
    settings,
    async start() {
        cachedFolderEntries = await DataStore.get("saveToFolderEntries") ?? [{ path: "", name: "" }];
    }
});
