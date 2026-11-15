# File-manager navigation

- Entering a directory through the file manager selects its first listed entry, excluding the synthetic `..` row, and focuses the file list for keyboard navigation.
- Empty directories keep an empty selection and focus the file list.
- Shell-driven directory changes do not move keyboard focus. A shell confirmation of the current directory preserves the file-manager selection.
