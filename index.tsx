/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Button, DeleteIcon, Flex, Grid, Heading } from "@components/index";
import { openPluginModal } from "@components/settings/tabs";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, openModalLazy } from "@utils/modal";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Channel, Guild, User } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { EmojiStore, IconUtils, Menu, React, TextInput, Toasts, useEffect, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.SaveTo as PluginNative<typeof import("./native")>;

const StickerStore = findStoreLazy("StickersStore") as { getStickerById: (id: string) => { name: string; } | undefined; };

interface FolderEntry {
    path: string;
    name: string;
}

interface FileInfo {
    url: string;
    filename: string;
}

interface ImageContextMenuProps {
    src: string;
}

interface MessageContextMenuProps {
    favoriteableId: string | null;
    favoriteableType: string | null;
    itemSrc: string | null;
    itemSafeSrc: string | null;
}

interface UserContextMenuProps {
    channel: Channel;
    user: User;
}

interface GuildContextMenuProps {
    guild?: Guild;
}


let cachedFolderEntries = [{ path: "", name: "" }];

// Like https://stackoverflow.com/a/59907288
function basenameish(path: string) {
    if (path === "") return "";

    let end = path.length - 1;
    while (path[end] === "/" || path[end] === "\\") end -= 1;

    const start = Math.max(path.lastIndexOf("/", end), path.lastIndexOf("\\", end));
    return path.slice(start + 1, end + 1);
}

async function saveHandler(srcUrl: string, path: string, name: string) {
    try {
        const savedName = await Native.saveToFolder(srcUrl, path, name);
        if (settings.store.showSuccessToasts) {
            Toasts.show({
                message: `Saved as ${savedName}`,
                type: Toasts.Type.SUCCESS,
                id: Toasts.genId()
            });
        }
    } catch (e: any) {
        Toasts.show({
            message: "Failed to save: " + e.message,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId()
        });
    }
}

/**
 * Construct a filename by extracting the file extension from the URL
 * @param srcUrl The source URL of the file
 * @param name The name of the file
 * @returns The filename with extension
 */
function getFilename(srcUrl: string, name: string) {
    const extension = basenameish(new URL(srcUrl).pathname).split(".").pop()?.match(/^[a-zA-Z0-9]+/)?.[0];
    return `${name}.${extension}`;
}

// Add the save to option to whatever context menus could have images
const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props: ImageContextMenuProps) => {
    // console.log(props);
    if (!props?.src) return;

    const filename = basenameish(new URL(props.src).pathname);

    const getFileInfo = () => Promise.resolve({ url: props.src, filename });

    const group = findGroupChildrenByChildId("save-image", children) ?? children;
    group.push(SaveToMenu("", getFileInfo));
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: MessageContextMenuProps) => {
    // itemSafeSrc is good for normal images/files
    let source: string | null = props.itemSafeSrc;
    let type = "";
    let filename = basenameish(source ? new URL(source).pathname : "");

    // Could probably simplify this at some point
    if (props.favoriteableType === "emoji" && props.itemSrc && props.favoriteableId) {
        const emoji = EmojiStore.getCustomEmojiById(props.favoriteableId);
        console.log(emoji);
        // Use to get highest quality avail
        source = props.itemSrc.slice(0, props.itemSrc.indexOf("?size=")) + "?size=4096&lossless=true&animated=true";
        filename = getFilename(source, emoji?.name || props.favoriteableId);
        type = "Emoji";
    }

    if (props.favoriteableType === "sticker" && props.itemSrc && props.favoriteableId) {
        const sticker = StickerStore.getStickerById(props.favoriteableId);
        // Use to get highest quality avail
        source = props.itemSrc.slice(0, props.itemSrc.indexOf("?size=")) + "?size=4096&lossless=true";
        filename = getFilename(source, sticker?.name || props.favoriteableId);
        type = "Sticker";
    }

    if (!source) return;

    const getFileInfo = () => Promise.resolve({ url: source, filename });

    // Put option in save image group
    let group = findGroupChildrenByChildId("save-image", children);
    if (group) {
        group.push(SaveToMenu(type, getFileInfo));
        return;
    }
    // If that isn't available, put it above open link group
    group = findGroupChildrenByChildId("open-native-link", children);
    if (group) {
        group.unshift(<Menu.MenuSeparator key="save-to-separator" />);
        group.unshift(SaveToMenu(type, getFileInfo));
        return;
    }

    children.splice(-1, 0, SaveToMenu(type, getFileInfo));
};

const userContextMenuPatch: NavContextMenuPatchCallback = (children, { user, channel }: UserContextMenuProps) => {
    // console.log(props);

    if (!user) return;

    const avatarUrl = user.getAvatarURL("", 4096, true);
    const serverAvatarUrl = user.getAvatarURL(channel.guild_id, 4096, true);
    const getAvatarInfo = () => Promise.resolve({ url: avatarUrl, filename: getFilename(avatarUrl, user.username) });
    const getServerAvatarInfo = () => Promise.resolve({ url: serverAvatarUrl, filename: getFilename(serverAvatarUrl, user.username) });

    children.splice(-1, 0, <Menu.MenuGroup>
        {SaveToMenu("Avatar", getAvatarInfo)}
        {user.hasAvatarForGuild(channel.guild_id) && SaveToMenu("Server Avatar", getServerAvatarInfo)}
    </Menu.MenuGroup>);
};

const guildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }: GuildContextMenuProps) => {
    console.log(guild);
    if (!guild || (!guild.icon && !guild.banner)) return;

    const getIconInfo = () => Promise.resolve({
        url: IconUtils.getGuildIconURL({
            id: guild.id,
            size: 4096,
            canAnimate: true
        }) ?? "",
        filename: getFilename(IconUtils.getGuildIconURL({
            id: guild.id,
            size: 4096,
            canAnimate: true
        }) ?? "", guild.name || guild.icon || guild.id)
    });

    const getBannerInfo = () => Promise.resolve({
        url: IconUtils.getGuildBannerURL(guild, true) ?? "",
        filename: getFilename(IconUtils.getGuildBannerURL(guild, true) ?? "", guild.name || guild.banner || guild.id)
    });

    children.splice(-1, 0, <Menu.MenuGroup>
        {guild.icon && SaveToMenu("Icon", getIconInfo)}
        {guild.banner && SaveToMenu("Banner", getBannerInfo)}
    </Menu.MenuGroup>);
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


// Uses callback to get file info and save image
function SaveToMenu(type: string, getFileInfo: () => Promise<FileInfo>) {
    const handleSave = async (path: string) => {
        const fileInfo = await getFileInfo();
        saveHandler(fileInfo.url, path, fileInfo.filename);
    };

    return (
        <Menu.MenuItem
            id={`save${type ? `-${type.replace(" ", "-")}` : ""}-to`}
            key={`save-${type.replace(" ", "-")}-to`}
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
                        action={() => handleSave(entry.path)}
                    >
                        <Menu.MenuItem
                            id={`save-${index}`}
                            key={`save-${index}`}
                            label="Save"
                            action={() => handleSave(entry.path)}
                        />
                        <Menu.MenuItem
                            id={`save-as-${index}`}
                            key={`save-as-${index}`}
                            label="Save As..."
                            action={() => {
                                openModalLazy(async () => {
                                    // Only need to get it once
                                    const fileInfo = await getFileInfo();

                                    return props => (
                                        <SaveAsModal
                                            modalProps={props}
                                            path={entry.path}
                                            defaultFilename={fileInfo.filename}
                                            onSave={(path: string, filename: string) => saveHandler(fileInfo.url, path, filename)}
                                        />
                                    );
                                });
                            }}
                        />
                    </Menu.MenuItem>
                    : null
            ))}
        </Menu.MenuItem>
    );
}

// Save as modal component

function SaveAsModal({ modalProps, path, defaultFilename, onSave }: { modalProps: ModalProps, path: string; defaultFilename: string; onSave: (path: string, filename: string) => void; }) {
    const extension = defaultFilename.split(".").pop()?.match(/^[a-zA-Z0-9]+/)?.[0];
    const defaultName = defaultFilename.split(".").slice(0, -1).join(".");

    const [name, setName] = useState("");

    function onSaveAndClose() {
        onSave(path, name ? `${name}.${extension}` : `${defaultName}.${extension}`);
        modalProps.onClose();
    }

    return (
        <ModalRoot {...modalProps}>
            <ModalHeader>
                <Heading tag="h4">Save As</Heading>
            </ModalHeader>
            <ModalContent style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <Heading tag="h5">Filename (leave empty for default)</Heading>
                <Grid columns={2} gap="0.5em" style={{ gridTemplateColumns: "1fr auto", alignItems: "baseline" }}>
                    <TextInput placeholder={defaultName} value={name} onChange={setName} onKeyDown={e => {
                        if (e.key === "Enter") {
                            onSaveAndClose();
                        }
                    }} />
                    <Heading tag="h5" style={{ textTransform: "lowercase" }}>{"." + extension}</Heading>
                </Grid>
            </ModalContent>
            <ModalFooter>
                <Button variant="primary" onClick={onSaveAndClose}>Save</Button>
                <Button variant="secondary" onClick={() => modalProps.onClose()}>Cancel</Button>
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
            <Heading tag="h4">Folder Paths</Heading>
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
                                size="min"
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
        component: ({ }) => {
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
    showSuccessToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when an image is saved successfully",
        default: true
    }
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
        "user-context": userContextMenuPatch,
        "guild-context": guildContextMenuPatch
    },
    settings,
    async start() {
        cachedFolderEntries = await DataStore.get("saveToFolderEntries") ?? [{ path: "", name: "" }];
    }
});
