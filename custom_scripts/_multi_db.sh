#!/bin/bash
# shellcheck shell=bash
#
# Shared helpers for working with ASM3 multi-database installations.

is_truthy() {
    case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
        1|true|yes|on) return 0 ;;
        *) return 1 ;;
    esac
}

load_database_entries() {
    DATABASE_ENTRIES=()

    local multi_flag="${ASM3_MULTIPLE_DATABASES:-}"
    local multi_type="${ASM3_MULTIPLE_DATABASES_TYPE:-map}"
    local map_json="${ASM3_MULTIPLE_DATABASES_MAP:-}"

    if is_truthy "$multi_flag" && [ "$multi_type" = "map" ] && [ -n "$map_json" ]; then
        local python_output
        if python_output="$(
            python3 -c "import json, os, sys
raw = os.environ.get('ASM3_MULTIPLE_DATABASES_MAP', '').strip()
if not raw:
    sys.exit(0)
try:
    parsed = json.loads(raw)
except Exception as exc:
    sys.exit('ERROR:' + str(exc))
for alias, info in parsed.items():
    print('{alias}|{dbtype}|{host}|{port}|{username}|{password}|{database}'.format(
        alias=alias,
        dbtype=info.get('dbtype', ''),
        host=info.get('host', ''),
        port=info.get('port', ''),
        username=info.get('username', ''),
        password=info.get('password', ''),
        database=info.get('database', '')
    ))
"
        )"; then
            if [[ $python_output == ERROR:* ]]; then
                printf 'WARNING: %s\n' "$python_output" >&2
            elif [ -n "$python_output" ]; then
                if [ "${BASH_VERSINFO[0]:-0}" -ge 4 ] 2>/dev/null; then
                    mapfile -t DATABASE_ENTRIES <<<"$python_output"
                else
                    DATABASE_ENTRIES=()
                    while IFS= read -r line; do
                        DATABASE_ENTRIES+=("$line")
                    done <<<"$python_output"
                fi
            fi
        else
            printf 'WARNING: Unable to parse ASM3_MULTIPLE_DATABASES_MAP\n' >&2
        fi
    fi

    if [ ${#DATABASE_ENTRIES[@]} -eq 0 ]; then
        # Fall back to the single-database values from the base configuration.
        local fallback_alias="${ASM3_DBNAME:-default}"
        DATABASE_ENTRIES=("${fallback_alias}|${ASM3_DBTYPE:-POSTGRESQL}|${ASM3_DBHOST:-postgres}|${ASM3_DBPORT:-5432}|${ASM3_DBUSERNAME:-asm3}|${ASM3_DBPASSWORD:-asm3}|${ASM3_DBNAME:-asm3}")
    fi
}

describe_database_entries() {
    local entry
    for entry in "${DATABASE_ENTRIES[@]}"; do
        IFS="|" read -r alias dbtype host port username _password database <<<"$entry"
        printf "%s -> %s (%s@%s:%s)\n" "$alias" "$database" "$username" "$host" "$port"
    done
}
