---
name: resources-manager-control
description: Search, inspect, organize, rate, sort, tag, and safely manage the user's local Resources Manager library through the Resources Manager MCP tools. Use when the user asks about their local media library, images, videos, novels, folders, ratings, tags, or viewing progress.
---

# Resources Manager Control

Use the Resources Manager MCP tools for requests about the user's local media library.

1. Call `connection_status` when the app or permission state is unclear. Use `open_resources_manager` when the user asks to open the app or when it is not running.
2. Search before mutating when a request names a resource but does not provide its ID. Never guess a series or item ID.
3. Respect the configured permission level. Explain the required level when a tool reports insufficient permission.
4. For image recognition, call `get_series` to obtain an image item ID, then call `analyze_image_and_tag`.
5. Dangerous tools return a confirmation ID. Tell the user to approve or reject the request in Resources Manager, then use `confirmation_status` only when its result is needed.
6. `remove_series` removes library indexes only. Never claim that it deletes the original disk files.
7. Keep tool results concise. Do not expose the local control token or API key.
