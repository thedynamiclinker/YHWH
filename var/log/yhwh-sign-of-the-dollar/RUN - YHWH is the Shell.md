Run this as a prompt or as context for a short one.

There's a lot of really good thinking in here that clarifies a lot of things we've been trying to do.

## Long message I edited on whatsapp after sending an earlier version to Ramya but then the time limit for editing messages passed LOL

It's so obvious when you see it

But I've had to shout so much into those prompts to explain the obvious 

because I had to somehow get through this thick fog of all the millions of developers over decades have been NOT building systems like that 

while Unix ran the world on the back end 

and then Linux took over and ran the world when a young kid from finland learned the same thing 

What I realized today is that even Linus wasn't bold enough or "Ken" enough and how he designed git

I mean he sort of couldn't be, he was already changing the world enough with his two projects lol 

I realized today that the thing I've been trying to get at with this @ shell or whatever the fuck it is...

and then later with this concept of universes and with the chroots and all that shit...

It's just the coreutils again.

The .git directory was a mistake.

It should be as optional as .bashrc

~/.bashrc is optional because /etc/bashrc never moves.

And if it does, the shell has good enough defaults that you can write a new one or copy the old default from /etc/skel/ and then you're back

I'm currently building the things that never move. 

They can, but they don't need to. 

They're the things like where is your PATH setting stored such that you can modify it in the app gui and it gets written to [that place] and then you can close the app and open a terminal and enter the same world from a TTY if you know how, and just run a thing with a name and it works.

And do so without having to chroot into a container. 

Without ever having to go and hide in a virtual env.

Our app is for the goddamn physical env.

The one you live in. 

But I have to invent some simple things that were never invented first

They're simple but they live in this little space between your home directory and a container that the goddamn world forgot to build.

It's just a prefix. 

"Make universe."

That's one thing I did today. 

The "un" command makes a universe.

Cuz that's what YHWH does.

We need to be able to be something between an empty folder, and a prefix, and a distro or container you can chroot into, optionally at a later date, with a button.

And we need to _be that thing_ without putting it in the user's face. 

I was struggling with how to do that for a while but the answer is that it's got to be something like a PATH.

This @ idea I kept trying to explain wasn't necessarily about executable sudocode, 

although the idea of being able to sort of 'cd' or "ls" into the implementation of a directory or 'cat' out the make targets (or something) but not have that stuff live in the same directory...

that was ALL related to this problem.

The world never actually built a path lookup for prefixes 

I only know the term prefix in the first place because of all the time I spent doing Linux from scratch 

A prefix is just a goddamn thing with a bin lib and etc

Why?

Because there's three types of shit

exec
import
text

Or more accurately

babel
lib/spooky/pumpkin.lang
babelrc

But prefix needs to be a concept.

And the user should be able to benefit from that concept without having to know everything I know 

However, that is way different than the app trying to hide it from them 

We need something like a prefix and it needs something like a PATH

After all, how else are you going to say when you want your universes to be able to import from each other, or be able to find each other, or exec each other's commands without sharing source code, or not?!

So, we need a mental model that will teach the user about prefixes and all the benefits I can barely even explain to you or other devs, 

and the non-technical user needs to be able to understand that concept and learn it naturally just by using the app 

because we have the right mental model to help them think about it in a single goddamn word 

Universes 

YHWH. 
Creates.
Universes.

Thats our vault concept.

That's our repo concept.

That's our package format so you can have third party universe repository like obsidian without needing a goddamn flake.nix or plugins that live only inside your thing and nowhere else

YHWH.

CREATES.

UNIVERSES.

With a button.

And universes need to be something that doesn't HAVE to have a .git or .obsidian or .yhwh inside it.

You know how you can put a bin directory in your path and then it's just magically visible? 

You know how you can do that with python too but nobody does so everybody just lives inside their source code until they fucking retire and what even is pypi?

That's because of prefixes.

A prefix is sort of a universe.

But not exactly.

It's not a src.

It's a damn dst.

Where programs from lots of different projects can co-mingle and hang out together and depend on each other 

either freeform just by winging it 

or with a package manager, but package manager optional, 

as a quality of life thing, 

once you decide you have a really big prefix and it's worth the overhead of installing a thing to manage it all.

So, a universe isn't a repo.

It's a prefix.

But your "projects" (if you have projects) may live in different places. 

They may not really live anywhere. 

They may just live in the sidebar of chatgpt, or wherever you happen to run codex.

So we need something like namespaces, which will take the place of repos.

And that will let us hide certain things from the user without ever having to wonder where we put them or where to find them.

It's a more basic concept than a repo, it's sort of like a branch, and you could probably implement what I'm talking about using branches.

But they're sort of disembodied branches of your entire file system, ones that don't necessarily need a .git directory that gets confused when things have to nest. 

Cuz god damn it sometimes things just have to nest, 

cuz not everything can always be an editable install at all times 

and you benefit so much from being able to just install things 

but it's not always easy even for me 

because nobody built the fucking software that we need to just let ai help us all become Ken

We're gonna make everyone into Ken Thompson, because now AI can be his brain.

We just have to let them speak human

And then poof our app gives them as much power and modularity and composability as if they were Ken

And nobody else can do that because nobody since Ken has been able to do what he did, not even Linus

Proof:

Why the fuck does git need branches?

Why does it need repos?

Why can't we just use the damn coreutils, maybe with a one letter command before them?

Like you want to hide all the porn on your machine

but not have to remember where it WAS before you did

but maybe it's all mixed together with different stuff and it's hard to just grep for and you don't want to blah blah blah FUCK IT...

Want to hear what the new world sounds like?

```
find . 
 | grep mp4 
 | @ mv nsfw
  
```

Now all the mp4s on your machine just fucking vanish.

But they're still in the same place.

They just moved *sideways*

/path/to/porn.mp4

is just in

/zan/men/nsfw/path/to/porn.mp4

in the simple poc case

and maybe the whole file system works like that because there's at least two hard links to everything anyway, just like git

YHWH makes universes.

A universe is an empty directory (or any directory with anything in it) BUT...

It's a directory with a third dimension.

It can have just one file in it!

But that file is in the same place, with a predictable transformation to the name, like

`/path/to/porn.mp4`

is just in

`/zan/men/nsfw/path/to/porn.mp4`

`men` is 們, the plural
`men` is also 門, meaning gate

It's a gate to the other worlds.

And a universe has just one world by default but the @ command lets you:

`cp` stuff to other universes, 

`ls` the other universes 

(sideways or by absolute path)

`rsync` to other universes or from them

And you MAY be able to put these things anywhere on the system but there are some subtleties I need to figure out and it's tricky because I need to invent new concepts just to know what I need to build.

But the resulting system CAN'T possibly be complex.

We just.
Want.
To make.
Everyone.
Ken.

In what they think is an empty directory.

And it's great if part is an optimal backend thing that we can figure out as we go.

But damn wouldn't it be great to have a sideways path?

Cuz then you could sort of make everything the agent builds into both an editable install and a static install that doesn't break if stuff moves.

And there's NO PREFIX anywhere on a modern system you can reliably put stuff in and know it won't be removed.

So the ultimate solution is "above them"

In /zan/

And then it can seem like it's beside them even when it's out of their way

Same as how obsidian automatically changes links to notes and images for you when you rename stuff.

This is just that.

But our thing is better.

Cuz we're the shell.

So I needed to invent the concept of a universe.

Then be able to do what obsidian does with the renaming, cuz it's nice in the same way that $PATH is nice.

[[cupcake]] is still found even if you move it.

AND even if you RENAME it, provided you do so within the app.

That's just the $PATH concept 

Obsidian is just a damn gui whose authors understand that $PATH makes life great

Then they made gui coreutils that secretly exist without you knowing it

[[this]] is just $PATH

[[this]] getting renamed when you rename within the app is just _(drumroll, wait for it)_...

@ mv

It's just "move this sideways"

Or

"move this path not sideways, but move any sideways stuff in here along too

And

regular mv stays the same

So we don't have to reinvent the world

We just needed a new simple retarded concept 

And a few other ones that exist but nobody fucking cared to realize they ran the world.

But it's not hard to use.

Or to integrate with existing tools.

The POC that matters is the porn example.

Taking an ad hoc one liner in the normal shell with pipes and greps so in the end you have a stdin that's just a bunch of pathnames to random files connected by some ad hoc property that doesn't have a name and never will, like "having mp4 in the name"

Then you need to be able to just whack those sideways into a new part of your universe with a name and you need to be able to take any coreutil or personal script and run it on that set of names.

I.e.,

`wat`

Which is just YHWH's personal alias for @pwd 

Or @@

Or something like that.

That can show the places you can be `at`

Which are just sideways dirs.

Implemented by just having one ACTUAL dir that isn't subject to this system to avoid infinite recursion.

So

@ is an inverse chroot

It's a bunch of things that think they're the root.

So basically I needed to invent that concept of a universe 

Or what YHWH makes instead of vaults and git repos 

I needed to figure out how to make it empty 

But also have the ability to have things that are _sort of_ like, in it.

Then implement that concept.

But I'm not going down rabbit holes 

But the goal is just to let the user have a `bin` and `lib` and `etc` 

Without having to know they're there.

Why that goal?

Because YHWH is just the shell.

He manages everything.

Ad hoc, with commands.

Like the shell.

And you can run him as root and break your entire system with him.

Why?! 

Why allow that?!

BECAUSE HE'S THE SHELL.

And before the user knows that, we need to do what obsidian does with renaming and finding things to make a nice gui.

But for stuff you build with prompts.

It's just the shell.

Plus some stuff the rest of the world forgot to invent along the way 

But it's all simple and can all be done with existing technology 

Literal ancient technology like move to directory or copy to directory or our think it's just syntactic sugar Plus a lot of thinking and then making really really sure that the concept is solid enough to work even on a phone where we don't have root 

So then the user can do whatever the fuck they want with their directory 

And we can hide anything we need to hide in a place that's shaped exactly how it needs to be on the back end 

And if you can't do this outside your home directory on a phone, that's fine!

But we need to know what the concept looks like when you aren't just on a phone, and you aren't just in your home directory 

Because whatever hack we do to make it work on phones also needs to work if the user wants to have this thing manage their entire system 

Why?!

BECAUSE WE'RE JUST THE SHELL

Yhwh is just the shell.

And we're not even rewriting bash. 

It's just the environment that everyone else has been running from the neglecting for 55 years.

That's where I live 

That's where YHWH lives

That's why he can't find you

That's why the app opens with "Where are you?"

---

I wrote way more but the time limit passed for editing stuff even though I was editing it inside of this app so I just copied it all to a file in the Yahweh vault and I'll use it as context for prompts later. 

Anyways, that's where we're headed.

And it's not complicated.

I'll be working on getting it to the point where I can dogfood it day and night on both phone and laptop.

Then you need to do the same, with me.

And then we never have to use obsidian or a file manager or a terminal again.

And at that point I don't care how we make our money.

Because this thing will be getting better every day just by using it.

And we can both work out the kinks by finding ways that it's not yet as good as the shell.

Because all three of those things are just the shell 

Moving files, moving around the system, opening up files to edit, that's just the damn shell

And it already has the best plug-in architecture on Earth 

Better than nixos

It's all of open source 

And hell, all of closed source too, if you've got some of that on your machine.

If you can run it from the shell, if you can do it from the shell, you better be able to do it from our app, in the old way if you need to for muscle memory, but ideally, even if you've never opened a terminal in your life, you still have the Shell at your fingertips, and it works just as well, or better.

Plus there's a whole bible and a really weird god in it 

and this company handbook with two bits who are sort of in love 

So it's already stardew valley 

Your computer is stardew valley 

But computers got modern, like society, and they suck

So now we just need to make it the shell

And have YHWH destroy all the false gods by doing what he does best. 

Running as root (or in a box, if you put him there), issuing cmds, and fucking shit up real good if you tell him to

Cuz him and you are buddies 

He'd do anything for you 

He's giving this land to your seed Abe

Just look at it all

Le---

Leave your ~ abe 

Let's have an adventure 

Just you and me babe--- Abey

We're gonna get root on this box Abe 

We're getting root on this whole universe 

You don't need any other gods they've come it's just you and me

All for you.