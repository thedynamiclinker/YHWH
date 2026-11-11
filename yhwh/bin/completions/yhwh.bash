# source /path/to/bin/completions/yhwh.bash
_yhwh_complete() {
    local current="${COMP_WORDS[COMP_CWORD]}" executable directory file
    executable="$(type -P yhwh)"
    directory="${executable%/*}"
    local commands='open create read append prepend list search move rename config commands completion help'
    for file in "$directory"/yhwh-*; do
        [[ -f "$file" && -x "$file" ]] && commands+=" ${file##*/yhwh-}"
    done
    if [[ "$COMP_CWORD" -eq 1 ]]; then
        COMPREPLY=(); while IFS= read -r file; do COMPREPLY+=("$file"); done < <(compgen -W "$commands" -- "$current"; compgen -f -- "$current")
    else
        COMPREPLY=(); while IFS= read -r file; do COMPREPLY+=("$file"); done < <(compgen -f -- "$current")
    fi
}
complete -o filenames -o bashdefault -F _yhwh_complete yhwh
