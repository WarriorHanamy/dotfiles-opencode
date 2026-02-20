#!/usr/bin/env bash

opencode() {
    session_random_key=$(basename $PWD)-$(openssl rand -hex 8 2>&- || random)
    export SHELL=$(which bash)
    export OPENCODE_ENABLE_EXA=1
    export AGENT_BROWSER_SESSION=$session_random_key
    command opencode "$@"
}

opencode "$@"
