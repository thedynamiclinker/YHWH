---

kanban-plugin: board

---

## Todo

- [ ] [R04] Replace esutils startup with standard logging (draft prepared)
- [ ] [R05] Find bundled model resources through package paths (draft prepared)
- [ ] [R06] Handle current pandas and NumPy input types (draft prepared)
- [ ] [R07] Restore saved HF transformers with current scikit-learn (draft prepared)
- [ ] [R08] Install esas and eshf for the original runners (draft prepared)
- [ ] [R09] Stream predictions with es-as and es-hf (draft prepared)
- [ ] [R10] Run ordered prediction batches across available CPUs (draft prepared)
- [ ] [R11] Limit comparison runs to the first N input rows (draft prepared)
- [ ] [R12] Choose decimal places for comparison output (draft prepared)
- [ ] [R13] Select the original runtime explicitly (draft prepared)
- [ ] [R14] Add the TensorFlow Lite interpreter option (draft prepared)
- [ ] [R15] Add the LiteRT interpreter option (draft prepared)
- [ ] [R16] Discover installed es subcommands on PATH (draft prepared)
- [ ] [R17] Install packages independently of interpreter wheels (draft prepared)
- [ ] [R18] Install a missing runtime on first use (draft prepared)
- [ ] [R19] Explain unsupported interpreter wheels before installing (draft prepared)
- [ ] [R20] Offer a compatible Python for interactive comparisons (draft prepared)
- [ ] [R21] Document comparison commands and align upgrade checks (draft prepared)
- [ ] [R22] Keep larger HF samples for local comparison runs (draft prepared)

- [ ] Verify the shared GitLab CI template before submission

- [ ] Run the full Neda runtime comparison matrix

## In Progress



## Review

- [ ] [R03] Add make install and make develop (in review)

## Done

- [x] [R01] Remove exact dependency pins and Python constraints (accepted locally)
- [x] [R02] Remove remaining build and development version pins (accepted locally)

- [x] Validate review recovery and comparison commands

- [x] Prepare and audit the draft commit sequence

- [x] Build the resumable review CLI

%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false]}
```
%%