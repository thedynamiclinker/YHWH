# Source this after compinit.
_yhwh() {
    local -a candidates
    if (( CURRENT == 2 )); then
        candidates=("${(@f)$(yhwh commands 2>/dev/null)}")
    elif [[ $words[2] == open ]]; then
        candidates=(default three obsidian)
    else
        candidates=("${(@f)$(yhwh _complete "$words[2]" 2>/dev/null)}")
    fi
    compadd -- "${candidates[@]}"
}
compdef _yhwh yhwh
