#compdef yhwh
_yhwh() {
    local executable="${commands[yhwh]}" file
    local -a subcommands
    subcommands=(open create read append prepend list search move rename config commands completion help)
    for file in "${executable:h}"/yhwh-*(N-*); do subcommands+=("${${file:t}#yhwh-}"); done
    if (( CURRENT == 2 )); then _describe 'command' subcommands; fi
    _files
}
compdef _yhwh yhwh
