
> Preliminary Note: See `giant-pile-of-yammering-for-context.md` in cwd for background info on what we're doing and why. I typed more than is necessary on purpose because this was also our introduction to new folks on an adjacent team, so I wanted to let them know how I think and talk etc etc.
> 
> Also, the repos in question can be found in ./es-as and ./es-hf. The paths mentioned below are still valid, but symlinked you to them so you can add notes and stuff in here while changing the code in there.

## Values System

Aka: What we care about, so you know how to interpret the prompt below and know how to interpolate and fill in any gaps we didn't have time to type.

>[!thing]
> In 1978, Doug McIlroy documented a set of principles encapsulating the "characteristic style" that had emerged among Unix system users and developers:
> Make each program do one thing well. To do a new job, build afresh rather than complicate old programs by adding new "features".
>
> Expect the output of every program to become the input to another, as yet unknown, program. Don't clutter output with extraneous information. Avoid stringently columnar or binary input formats. Don't insist on interactive input.
> 
> Design and build software, even operating systems, to be tried early, ideally within weeks.
> 
> Don't hesitate to throw away the clumsy parts and rebuild them.
> 
> Use tools in preference to unskilled help to lighten a programming task, ==even if you have to detour to build the tools and expect to throw some of them out after you've finished using them.==
> 
> Later, in 1994, it was summarized with the explicit name "The Unix philosophy" by Peter H. Salus, who credited it to McIlroy:
> 
> Write programs that do one thing and do it well.
> 
> Write programs to work together.
> 
> Write programs to handle text streams, because that is a universal interface.


## Introduction

Or: Following that highlighted advice up there, cuz that's the guy who literally invented "pipes" and he was also the boss of the guy who made both C and Unix so damn, he knows stuff. Ok so...

First let's quickly hack up a tool to make life easier now and in the future as we do all these runs we need to do in order to compare outputs.

Lots of ways to make life easier whenever we have to do that stuff.

The main tool we'll need is a new cli that can be installed by typing `make install` or `make develop`. See the layout of `~/Desktop/es` for what we're going for. For now though, don't delete the top level cruft in this repo. Just make the minimal changes to support the requests below in each commit.

Side Note: We're doing this for two repos.
If you're in the `es-as` repo, call the cli `esas`. 
If you're in the `es-hf` repo, call the cli `eshf`.
End of side note.

Side Note 2:
1. The `tflite-runtime` library only supports python versions <= 3.11.
2. The `tensorflow.lite` approach supports up to 3.14 I think.
3. The `litert` approach also supports up to 3.14 I think.
4. The `es-as` repo "requires" (but not really) python3.9 at the moment. We'll be changing that soon to be agnostic about the version and just "work" with whatever version you try without crashing itself on purpose because of some line in pyproject.toml, whatever, you get it.
5. `ibid | sed -e 's/es-as/es-hf/g' -e 's/3.9/3.11/g'`
6. Not sure if (2) and (3) support python 3.11 but I'm guessing they probably do.
7. Not sure if (2) and (3) support python 3.9 but I'm less sure about that one.
8. Just be aware of that.

Ok so...

## Examples

Examples of things that should be supported by the new tool(s) we want you to implement to help us run the models and diff their outputs more easily. (replace with `eshf` in `es-hf`):

```bash
esas --runtime legacy ...
# ^ this should use tflite-runtime, the current approach

esas --runtime tflite
# ^ this should use tf.lite, the current approach in es-hf's simple branch

esas --runtime litert
# ^ this should use litert, which we haven't tried yet

esas --legacy
# ^ this should let us access all the functionality currently provided by the repo's top level .py file that the README says to run with `python3 ./whatever.py --etc --csv --other-options`. Unlike the main `esas` command without --legacy, this one should work exactly like the $repo_root/whatever.py interface works now.

esas --nproc <n> ...
# this should use n cores or workers or whatever the runtime in question calls that, to make the runs quicker. if possible, either iterate over the data in batches and send it to the worker subprocesses or do [whatever the best method you can think of is] to allow the stuff I mention below about stdout and [head / streaming / avoiding broken pipe errors / being properly unix-y]. Basically add parallelism by default, $(nproc) cores by default, but make sure that doesn't goof up our ability to be stream-y and print results to stdout as soon as they're available, batched into whatever size you think makes sense by default if needed since I know weird doing a bunch of matmuls here. Ok that's that one.

esas --help
# should be a pretty and very helpful argparse help with lots of concrete examples of different one-liners that should all work and what they do
```

## The Commits

Ok so, here's what we want you to do...

In this repo, make a new branch from `main` called `mainer`, then perform the follow list of todo items, in order, and add one commit for each item below after you've implemented each one.

Also, for context, we're making these changes in a repo that's already been submitted as an FDA thing and approved, so we're trying to make not-too-many changes overall, and ideally zero or few changes to the "code" part of the repo aside from what's needed to support (a) tf.lite, and (b) litert as options for what's currently performed by (c) tflite-runtime, which we're looking to replace with (a) or (b) because the latest python that (c) is compatible with is python3.11, but the other two packages have essentially identical functionality, so it's ok to make that change. We're doing it in order to upgrade versions of python and all the dependencies, and to be able to easily run the repo's existing functionality in a simpler way, without having to `cd` into the damn thing and run `python ./something.py --options`.

So in the spirit of the McIlroy quote above, we're going to build some tools along the way (even if we ultimately can't merge them into remote main), to make our job easier now and in the future when we have to run anything in either of these repos.

Why the cli? Short answer: because right now both repos (1) can only be run from inside the repos themselves, (2) can't be 'installed' easily to anywhere in $PATH or $PYTHONPATH, (3) write too many result files most of which we don't care about, and (4) write outputs to disk whereas we'd prefer they write to stdout so we can answer the kind of questions we get asked by just going `diff -u <(esas --options1) <(esas --options2)` or at worst maybe `diff -u <(esas1 --options1) <(esas2 --options2)` (in the `esas` case)

Ok so, do these things in this order.

## Commits

Make one commit for each, with a brief succinct commit message header and a brief clarification of what new feature the commit adds and/or what it changed and why. Ok so do these things first:

### PR 1: Remove hard coded versions

1. Commit 1: Remove all hard coded python version requirements from the repo and its docs and README and all that. Just try to use whatever python is in the user's '$PATH' in the current shell environment. Don't be venv-y. We're trying to be generic and flexible here, we're not trying to require anything that isn't forced upon us by actual reality (i.e., by bugs or behaviors we can't fix or work around).
2. Commit 2: Remove all hard coded versions of dependencies from requirements.txt / pyproject.toml / etc.

The above technically completes the task we need to do.

All the stuff below is us building tools to simplify our lives by turning the repo into "software." 

i.e., building tools that we'd like to have in order to do tha analysis they'll want to see before we can convince them the version upgrade doesn't change anything that the FDA is gonna care about. Ok so, tool time...

### PR 2: Make it installable (and make it install something useful)

Tl;dr:
- Suddenly the repo can do lots more things.
- But currently we can only use its new abilities by going inside the repo and doing a grab bag of manual things.
- So before we do the analyses to see if anything changed, it'd be nice if we could access all the new abilities we just gained by typing a few magic words, like `esas --beep --boop --etc`

Now that we can in principle run with multiple versions of python, we have to address the fact that (1) we've been asked to compare the before and after for various versions of python et al (2) which runtime we can use is coupled to the choice of python version (3) we've got one legacy runtime and two options for what to choose going forward, so (4) we'd like to be able to compare the runtimes by holding constant as much as possible about python and its deps (5) that's a lot of stuff going on at once, so it'd be nice to have a cli where each `[thing we need to run to do all that]` is a short one-liner that returns its results so somewhere other than disk and uses all cores of the machine by default, cuz otherwise the version upgrade takes 5 seconds but checking that nothing changed is gonna take a year, due to the fact that "run model on everything and compare with HEAD" is sort of the _real_ test suite that we have to do before we can say "Hey look all is well."

In short, to compare the before and after of the simple thing we're about to do, we're gonna first make it super easy to to the "before" thing and the "after" thing without (a) having to be inside the repo (b) having the results written to disk (c) having to manually split up neda into files if we want to run the thing concurrently (d) other headaches that happen every time we use either repo to run anything, but which we can fix real easily without any changes to the "actual code." Ok so...

So at this point we need to make some changes so that we have the hope of making this repo actually work with (say) `python3.14`, `python3.13`, or `python3.12` if called with the `--runtime` values that support those versions, and not crash when we run `esas --runtime litert` on a system where python3.14 is the default just because (e.g.) `esas --runtime legacy` is supported by the same codebase and `legacy` is `tflite-runtime` which doesn't support > python3.11. Got it? Great. Here's my idea of how to achieve the above, but feel free to take a different approach if you know of a better one. Here's my thoughts on what to do:

- Commit: Make it installable: Do the part where you add the Makefile based on `~/Desktop/es`.

- Commit: Remove `esutils`. It (a) doesn't do anything, and even more importantly (b) it's a proprietary dependency and therefore breaks unless `[manual-things-a-human-has-to-do]`, because the company gitlab isn't yet set up in a way that lets proprietary deps explicitly declare that they depend on others. (Side Note: Down to make this work so that nobody else ever has to think about it. It would let our repos do more stuff automatically for the devs.)

- Commit: Make it install something useful. Adds an installable cli named `esas` (or `eshf` if you're in the `es-hf` repo). Add a line to pyproject.toml based on lines 24 and 25 of ~/Desktop/es/pyproject.toml. We'll use this script as the interface to the new useful stuff we can magically do now. Make the `esas` command be a more Unix-y command line interface to the things that `es-as` and `es-hf` put in their repo-root's `something.py` that the READMEs say to run manually with `python3 ./something.py --csv --blah-blah`. Specifically, make the command output its results to stdout as a list of lines. Instead of the output dir with all the files that gets created now, JUST output (to stdout) a whitespae separated `[thing-im-about-to-say] | column -t` formatted list of lines containing, for each row in what used to be in the output file, (1) the StudyID, the `as_probability` (and `as_risk` if it exists as a column in the outputs: we're adding this but it's currently in another branch so include if present) for `es-as`, or the `hf_probability` and `hf_risk` for `es-hf`. Make `esas` run itself on `es.Neda2()` by default, and on `es.Neda3()` if the user passes `-v 3 / --version 3` on the command line. And since we now need the functionality of `es` as a dependency, also declare that explicitly by adding this `"es @ git+https://gitlab.echoiq.ai/product/data-science/es.git"`

- Commit: One commit that adds support for `esas --runtime legacy`. At this point, this should do nothing except making the argparse option explicit, but since we were already using `tflite-runtime`, it does nothing atm.

- Commit: One commit that adds support for `esas --runtime tflite`.

- Commit: One commit that adds support for `esas --runtime litert`.


### Try to make things fail less, despite the very fail-y infrastructure of our current gitlab

1. Commit: In the above commits you should have put all deps in the pyproject.toml. Now in this commit, remove `tflite-runtime` and `litert` and `tensorflow` from the pyproject.toml or requirements.txt's dependencies. We're going to try instead to do what huggingface's transformer library does with its models, and just lazily get stuff when a user first uses it, so toward that end...
2. Commit: If a user runs `esas --runtime litert`, then try to pip install `litert` _at runtime_ into whatever the current environment is. Same deal for the other two packages. If the install fails, say what happened and give a helpful error message that tells the user concrete steps they can do to try to remedy the problem on their end. If it succeeds, don't worry about explaining to the user, just proceed to run the thing.
3. Commit: For cases where we know IN ADVANCE that something's probably gonna fail, e.g., running `esas --runtime litert` with python3.9, give the user a brief error message that just says "PyPI doesn't have a version of `[insert whatever thing they're trying to use as runtime]` for python `[version blah]`, isn't supported.
4. Commit: If you can do this without massive insane hacks (which I bet we can, it's just a wget and an exec) then rather than failing in case 3, ask the user interactively whether they'd like to use `uv` (downloading it for their platform from the most reliable and trusted source if it's not already in "$PATH") to dynamically upgrade the python version of the running process from `[running python version]` to (say) `3.14` (give a menu of all supported python versions for the given `--runtime`. Make it a little simple ncurses or `gh repo create` type of interactive dialogue) and then if that works just `exec` the same thing as the running `sys.argv` the user originally ran but with whatever modifications you need to be able to use the python version they asked for.

Do all that, make each PR's git commit messages say something like

PR 1:1 - Summary of first commit in PR 1.
PR 1:2 - Summary of second commit in PR 1.

Don't try to push or whatever.

Just do everything above until it's finished, robust, and working with one new `__main__.py` file implementing the new cli and its `--legacy` support, and then a bunch of small changes to mostly non-code files in and around the repo root, plus a few new lines that are needed to run the tflite file in the way all 3 of those libraries do.

Aim to make us pleasantly surprised by how well you were able to accomplish all this.

You're doing great so far. Keep it up.

Go!
