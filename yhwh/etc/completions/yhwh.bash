_yhwh_complete() {
    local current="${COMP_WORDS[COMP_CWORD]}" command="${COMP_WORDS[1]}" line
    COMPREPLY=()
    if (( COMP_CWORD == 1 )); then
        while IFS= read -r line; do [[ $line == "$current"* ]] && COMPREPLY+=("$line"); done < <(yhwh commands 2>/dev/null)
    elif [[ $command == open ]]; then
        mapfile -t COMPREPLY < <(compgen -W 'default three obsidian' -- "$current")
    elif [[ $command =~ ^(begin|review|run|add|commit)$ ]]; then
        while IFS= read -r line; do [[ $line == "$current"* ]] && COMPREPLY+=("$line"); done < <(yhwh _complete "$command" 2>/dev/null)
    fi
}
complete -F _yhwh_complete yhwh
