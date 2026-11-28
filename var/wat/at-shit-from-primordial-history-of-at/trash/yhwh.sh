#!/usr/bin/env bash
set -euo pipefail

repo=$PWD
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
trap 'printf "yhwh test failed at line %s\n" "$LINENO" >&2' ERR
export HOME="$fixture/home" NSH_HOME="$fixture/prefix" PATH="$fixture/bin:$PATH"
unset LD_RUNNER NSH_PROGRAM NSH_TURN NSH_FAST_MODEL
mkdir -p -- "$HOME" "$fixture/bin" "$fixture/work"
prefix="$fixture/installed tree"

make -s install PREFIX="$prefix"
cmp @ "$prefix/bin/@"
test ! -L "$prefix/bin/@"
export PATH="$fixture/bin:$prefix/bin:$PATH"
cd -- "$fixture/work"
printf '%s\n' 'local instructions' > AGENTS.md

cat > "$fixture/bin/codex" <<'BACKEND'
#!/usr/bin/env bash
set -euo pipefail
test "$1" = exec
test "${@: -2:1}" = --
[[ "$*" == *'--sandbox danger-full-access'* ]]
request=${!#}
input=$(cat)
runner=
if [[ "$request" == 'Runner: '* ]]; then
    runner=${request%%$'\n'*}
    runner=${runner#Runner: }
    request=${request#*$'\nUser input:\n'}
    [[ "$*" == *'--ephemeral'* ]]
    printf '%s %s\n' "$runner" "$request" >> "$NSH_HOME/runner-calls"
fi
case "$request" in
    "sed s/write a prompt/do this prompt/")
        [[ "$*" == *'You are @, the New Human Shell'* ]]
        [[ "$*" == *'Maintain this program'* ]]
        [[ "$*" == *'model_reasoning_effort="xhigh"'* ]]
        printf '%s\n' "$input" | sed 's/write a prompt/do this prompt/'
        printf 'backend progress\n' >&2
        ;;
    "cat 'this prompt' @ sed 's/write a prompt/do this prompt/'")
        [[ -z "$runner" && "$*" == *'model_reasoning_effort="xhigh"'* ]]
        sed 's/write a prompt/do this prompt/' 'this prompt'
        ;;
    false|'(exit 130)')
        [[ "$runner" == law && "$*" == *'--model gpt-6-luna'* ]]
        status=1
        [[ "$request" != '(exit 130)' ]] || status=130
        [[ "$input" == *"Bash result: exit $status"* && "$input" != *'Bash stderr'* ]]
        printf '@fail\nBash returned %s.\n' "$status"
        ;;
    'printf ran >> side-effect; (exit 23)')
        [[ "$runner" == law && "$input" == *'Bash result: exit 23'* ]]
        [[ "$(cat side-effect)" == ran ]]
        printf '@fail\nBash returned 23.\n'
        ;;
    'mystery @cbh')
        [[ "$input" == *'Input: mystery @cbh'* && "$input" == *'Input: value=42'* ]]
        [[ "$input" != *'private_value=17'* ]]
        [[ "$input" == *'Bash result: exit 127'*'mystery: command not found'* ]]
        [[ "$input" == *'Saved shell history'*'echo saved-earlier'* ]]
        case "$runner" in
            law)
                printf '%s\n' "$input" > "$NSH_HOME/first-context"
                printf '@more\n'
                ;;
            lawd)
                [[ "$input" == "$(cat "$NSH_HOME/first-context")" ]]
                printf '@more\n'
                ;;
            lord)
                [[ "$input" == "$(cat "$NSH_HOME/first-context")" ]]
                [[ "$*" == *'model_reasoning_effort="medium"'* ]]
                printf '@ask\nWhat should mystery do?\n'
                ;;
            *) exit 71 ;;
        esac
        ;;
    -)
        [[ "$runner" == law && "$input" == *'Pending question:'*'What should mystery do?'* ]]
        [[ "$input" == *'Failed Bash turn:'*'Input: mystery @cbh'*'Bash result: exit 127'* ]]
        printf '@ask\nWhat should it print?\n'
        ;;
    fg)
        [[ "$runner" == law && "$input" == *'Pending question:'*'What should it print?'* ]]
        [[ "$input" == *'Failed Bash turn:'*'Input: mystery @cbh'*'Bash result: exit 127'* ]]
        printf '%s\n' '@cbh | mystery means say lite' > "$NSH_HOME/etc/nshrc"
        printf '%s\n' "alias mystery-alias='mystery'" > "$NSH_HOME/etc/nsh.bash"
        printf '%s\n' 'say_lite() { echo lite; }' > "$NSH_HOME/lib/mystery.sh"
        printf '%s\n' '#!/bin/sh' '. "$NSH_HOME/lib/mystery.sh"' say_lite > "$NSH_HOME/bin/mystery"
        chmod +x "$NSH_HOME/bin/mystery"
        printf 'Learned.\n'
        ;;
    'take note:'$'\n''  keep this line')
        [[ "$runner" == law && "$input" == *'Bash result: exit 127'* ]]
        printf 'Got both lines.\n'
        ;;
    '@@ example'|'-c example')
        [[ "$*" == *'Test English program'* ]]
        printf '%s\n' "$request"
        ;;
    'selected runner '*)
        [[ "$*" == *'Test English program'* ]]
        [[ "$*" == *"model_reasoning_effort=\"${request#selected runner }\""* ]]
        printf '%s\n' "$request"
        ;;
    '@')
        [[ "$*" == *'You are @, the New Human Shell'* ]]
        printf 'α | Ω\n'
        ;;
    fail)
        printf 'partial stdout\n'
        printf 'backend diagnostic\n' >&2
        exit 42
        ;;
    *) exit 70 ;;
esac
BACKEND
chmod +x -- "$fixture/bin/codex"

printf '%s\n' 'write a prompt' > 'this prompt'
cat 'this prompt' | @ sed 's/write a prompt/do this prompt/' > "$fixture/output" 2> "$fixture/stderr"
test "$(cat "$fixture/output")" = 'do this prompt'
test ! -s "$fixture/stderr"

nsh -c "@ \"cat 'this prompt' @ sed 's/write a prompt/do this prompt/'\"" > "$fixture/output"
test "$(cat "$fixture/output")" = 'do this prompt'
test "$(cat 'this prompt')" = 'write a prompt'
test "$(nsh -c 'echo left @ right')" = 'left @ right'
test "$(nsh -c "echo '@' literal")" = '@ literal'
test "$(nsh -c 'echo \@ literal')" = '@ literal'
test "$(nsh -c 'ld.so echo native @ escape')" = 'native @ escape'
test "$(nsh -c 'printf "%s %s\n" "$0" "$1"' script argument)" = 'script argument'
test "$(printf '%s\n' ':' 'echo native:' | nhs)" = 'native:'
nsh -c 'false; false | true'
test ! -e "$NSH_HOME/runner-calls"

status=0
nsh -c 'false' > "$fixture/output" 2> "$fixture/stderr" || status=$?
test "$status" = 1
test ! -s "$fixture/output"
test "$(cat "$fixture/stderr")" = 'Bash returned 1.'
test "$(cat "$NSH_HOME/runner-calls")" = 'law false'
status=0
nsh -c '(exit 130)' > "$fixture/output" 2> "$fixture/stderr" || status=$?
test "$status" = 130
test "$(cat "$fixture/stderr")" = 'Bash returned 130.'
status=0
nsh -c 'printf ran >> side-effect; (exit 23)' > "$fixture/output" 2> "$fixture/stderr" || status=$?
test "$status" = 23
test "$(cat side-effect)" = ran

printf '%s\n' 'echo saved-earlier' > "$NSH_HOME/history"
: > "$NSH_HOME/runner-calls"
nsh > "$fixture/output" 2> "$fixture/stderr" <<'SESSION'
value=42
 private_value=17
false
printf '%s %s\n' "$?" "$value"
mystery @cbh
ld.so printf 'question status %s\n' "$?"
  ld.so false
-
fg
mystery
mystery-alias
SESSION
printf '%s\n' '1 42' 'question status 2' Learned. lite lite > "$fixture/expected"
cmp "$fixture/expected" "$fixture/output"
rg -q 'mystery: command not found$' "$fixture/stderr"
printf '%s\n' 'law false' 'law mystery @cbh' 'lawd mystery @cbh' 'lord mystery @cbh' 'law -' 'law fg' > "$fixture/expected"
cmp "$fixture/expected" "$NSH_HOME/runner-calls"
test "$(tail -n 2 "$fixture/stderr")" = $'What should mystery do?\nWhat should it print?'
test "$(cat "$NSH_HOME/etc/nshrc")" = '@cbh | mystery means say lite'
test "$(nsh -c mystery)" = 'lite'
test "$(nsh -c mystery-alias)" = 'lite'
test "$(printf '%s\n' ':paste' 'take note:' '  keep this line' '' | nhs 2> "$fixture/stderr")" = 'Got both lines.'

program="$fixture/English program"
printf '%s\n' '#!/usr/bin/env LD' 'Test English program' > "$program"
chmod +x -- "$program"
test "$("$program" @@ example)" = '@@ example'
test "$("$program" -c example)" = '-c example'
test "$(LD "$program" -- -c example)" = '-c example'
test "$(LD @ </dev/null)" = 'α | Ω'
printf '%s\n' 'Test English program' > 'plain prose'
test "$(LD 'plain prose' @@ example)" = '@@ example'
while read -r runner effort; do
    test "$(LD_RUNNER=$runner LD "$program" selected runner "$effort")" = "selected runner $effort"
done <<'RUNNERS'
law low
lawd low
lord medium
lorde high
lordhavemercy xhigh
lordylordydaddysforty max
RUNNERS
test "$(cat AGENTS.md)" = 'local instructions'

status=0
@ fail </dev/null > "$fixture/output" 2> "$fixture/stderr" || status=$?
test "$status" = 42
test ! -s "$fixture/output"
test "$(cat "$fixture/stderr")" = 'backend diagnostic'
status=0
: > "$NSH_HOME/runner-calls"
nsh -c fail > "$fixture/output" 2> "$fixture/stderr" || status=$?
test "$status" = 42
test ! -s "$fixture/output"
test "$(cat "$NSH_HOME/runner-calls")" = 'law fail'
test "$(tail -n 1 "$fixture/stderr")" = 'backend diagnostic'

cd -- "$repo"
make -s develop PREFIX="$prefix"
test -L "$prefix/bin/@"
test "$(nsh -c 'printf developed')" = developed
test "$(@ </dev/null)" = 'α | Ω'
make -s install PREFIX="$prefix"
test ! -L "$prefix/bin/@"
make -s uninstall PREFIX="$prefix"
test -z "$(ls -A -- "$prefix/bin")"
