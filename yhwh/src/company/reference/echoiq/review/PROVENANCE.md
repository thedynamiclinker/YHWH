# Source history and draft rounds

This maps every source commit to its new review rounds. Final tree comparison
confirms all tracked source changes survive, with the documented guide/test corrections.

## es-as

Base: `ff18cd87895294ca59f2cb85fd52a9f99aa50d13`. Source: `fcffa481c6c1858bc29df6fd73747b8676b3e29a`.

| Source commit | Summary | New rounds |
|---|---|---|
| `91bffb7cf551` | PR 1:1 - Use the current Python environment | R01, R21 |
| `e1dea8b768e6` | PR 1:2 - Let dependencies resolve compatible versions | R01, R02, R05, R06, R21 |
| `24f74278cd61` | PR 2:1 - Add ordinary and editable make installs | R03 |
| `e98ecceb1927` | PR 2:2 - Remove the proprietary esutils dependency | R04, R21 |
| `613b1894b55d` | PR 2:3 - Install a streaming esas command | R08, R09, R10 |
| `48bd8ba7b857` | PR 2:4 - Name the legacy inference runtime | R13 |
| `110ecda981a2` | PR 2:5 - Support TensorFlow Lite inference | R13, R14 |
| `ad5f82b1ba7e` | PR 2:6 - Support the Google LiteRT runtime | R15 |
| `a93bb7bae2c7` | PR 3:1 - Make interpreter packages optional | R17 |
| `a1f905c3016f` | PR 3:2 - Install selected runtimes on first use | R18 |
| `2dc5bfdde504` | PR 3:3 - Detect unavailable Python and platform wheels | R19 |
| `f5bab4cda218` | PR 3:4 - Offer uv to rerun on a compatible Python | R20 |
| `504573c60720` | PR 2:3 follow-up - Separate legacy and streaming AS commands | R08, R09 |
| `55b0e6f5d367` | PR 2:3 follow-up - Limit AS runs to the first input rows | R11 |
| `e9b64e02b783` | PR 2:3 follow-up - Round AS stdout on request | R12 |
| `fcffa481c6c1` | PR 2:3 follow-up - Resolve es as a package dependency | R09, R21 |

## es-hf

Base: `f1c251e635ece3f7163d0dc7833b77e9e82073ca`. Source: `7b991c911119eeb52c3e0fdc8f45ccb85d31d752`.

| Source commit | Summary | New rounds |
|---|---|---|
| `7c911867f605` | PR 1:1 - Use Python from the current shell | R01, R03, R21 |
| `990f1c1e805c` | PR 1:2 - Let dependencies select compatible releases | R01, R02 |
| `9f95c119ab49` | PR 2:1 - Install the package with make | R03, R05 |
| `e448fdcfbb97` | PR 2:2 - Remove the proprietary esutils dependency | R04 |
| `6fe743f94d52` | PR 2:3 - Stream HF predictions with the eshf command | R09, R10 |
| `ca29a2519472` | PR 2:4 - Select the legacy interpreter explicitly | R13 |
| `db6c7d3b1ed6` | PR 2:5 - Run inference with TensorFlow Lite | R14 |
| `2ac419a30426` | PR 2:6 - Run inference with LiteRT | R05, R06, R15 |
| `a6fcf57b0200` | PR 3:1 - Install without inference runtimes | R17 |
| `58494056f5b6` | PR 3:2 - Install the selected runtime on first use | R18 |
| `e40fc110511b` | PR 3:3 - Detect unsupported runtime wheels before installing | R19 |
| `480a665445c5` | PR 3:4 - Offer a supported Python through uv | R06, R07, R10, R20 |
| `fe2b5d544638` | PR 2:3 follow-up - Separate legacy and streaming HF commands | R08, R09 |
| `5d53095efd25` | PR 2:3 follow-up - Limit HF runs to the first input rows | R11 |
| `d9e49feec160` | PR 2:3 follow-up - Round HF stdout on request | R12 |
| `221f7e9945df` | PR 2:3 follow-up - Resolve es through the package index | R09, R21 |
| `7b991c911119` | PR 2:3 follow-up - Add larger HF input samples | R22 |

## es

Base: `6d7cdf91da93050cac7b280831200696c40ea340`. Source: `d45e18558dcd6c094d41ccb220a3b67c1399d411`.

| Source commit | Summary | New rounds |
|---|---|---|
| `d45e18558dcd` | Be like git™ - Discover installed es subcommands | R16 |

