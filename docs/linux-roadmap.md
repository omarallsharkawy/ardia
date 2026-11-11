# Linux roadmap

How the Linux build compares with the macOS one. The coverage numbers were taken on the `linux-support` branch at commit `f6181b6b`.

## Coverage

The macOS native method names compared with what the Linux build implements. This compares names in the code; it isn't a test of each feature.

| Status | Count | Meaning |
| --- | --- | --- |
| Implemented | 136 | Has a Linux implementation |
| Empty fallback | 64 | The call answers a fixed value or "unavailable" |
| Missing | 2 | `haptic` and `holdKeyLook` |

This leaves out 38 internal development methods with no effect for users, and the `engine.*` methods. Some "empty fallbacks" have another route, such as `ArdiaKeychain`, because Linux keeps passwords in the Secret Service.

## Fixed in this fork

- Minimize and its menu items are disabled, because minimizing stops the window from painting on niri.
- The `downloadsDismissal` and `left_edge` tests, and the `acceptance` connection timeout.
- Five page settings with no Linux implementation answer quietly instead of logging console errors.
- `privacy.commandScrollZoom` and `general.littleArdiaOpensNewTabLinks` are hidden, because they have no effect on Linux.
- `install.sh --user` installs under `~/.local` without root and without the polkit policy.
- An import the engine withholds (a value in it matches a password, cookie value or card number) runs again in groups: bookmarks, history and tabs; passwords; cookies and cards.
- Usage data is off until the user turns it on, instead of always on.
- CI tries archive.ubuntu.com first and times out instead of hanging when Ubuntu's mirrors don't answer.

## Needs an engine (Chromium) build

1. Read `wm_capabilities` from Wayland, and enable minimize again where the compositor supports it, such as GNOME and KDE.
2. Paste and Go, because reading the clipboard returns nothing.
3. Deleting a profile's data (`profiles.deleteData`).
4. Exporting bookmarks as HTML, `webView.setPeekOtherSiteTabs` and `webView.setCommandScrollZoom`.
5. Dragging a tab between windows on Wayland.
6. Setting Ardia as the default browser from Settings, launching at login, and the scrollbar style.

## Possible without an engine build

1. The hover card that stays open when the pointer moves into the page.
2. The sidebar cut-out in the top tab strip layout.
3. AUR and AppImage packages.

Items 1 and 2 need trying on a running build, because the automated tests don't cover the pointer moving between the strip and the page.

## Not available on Linux yet

Cast, translation, video upscaling, automatic updates, crash reports, Ardia's own notifications, and sharing.

## macOS only

Handoff, AppleScript, alternate app icons and iCloud sync. Sync on Linux works through a folder.

## Needs manual testing

Real accounts, the calendar, password managers, the polkit prompt, touchpad pinch, and sync between Linux and macOS.
