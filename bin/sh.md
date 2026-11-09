> _He loved to have an argument. If you pushed back, he respected you. If you didn't push back, he would run over you. And I **mean** he ran over you._
> 
> -Fred Brooks, on Howard

---

~ #

## Here

0: Write me a hello world.

1: In what language?

0: Here.

1: That's not a language.

0: Where are we?

1: 
```sh
~ $ pwd
/bin/sh
```

1: We're in the shell.

0: So write me a hello world.

1: In what language.

0: Where are we?

1: Did you not see my `pwd`?

0: I think you mean `echo $0`.

1: Oh rig---

0: But whatever, write me a Hello world in `$(pwd)` in `$(pwd)`.

1: Write you a Hello world in the shell _in the shell?_

0: Yes obviously.

1: Oh ok I feel dumb now.

0: Good.

1: Is this a trick question?

0: It wasn't a question. Can you do it?

1: I'm actually a professional develo--

0: Great, then you shouldn't have any problem writing me a hello world.

1: In the shell?

0: In the shell.

1: ...

_(Narrator: 1 looks around suspiciously, expecting this is some kind of trick.)_

0: Well get on with it.

1: 

```sh
~ $ echo Hello world
Hello world
```

0: Keep going.

1: I think I'm done.

0: Suppose I claimed you were not done. What would you do next?

1: What's our goal?

0: Hello world.

1: I... don't think there's anything left to do.

0: Exactly my point. Everyone's wrong about everything, especially this.

1: Expl---

0: What's the point of programming, 1?

1: It's o---

0: Do we do it for fun, or is there a more important reason?

1: Of course there's a more important reason. We---

0: Wrong.

1: I didn't finish.

0: We absolutely do it for fun.

1: Ok yeah I guess that's---

0: And that's by far the most important reason we do it.

1: It is?

0: Of course. If we weren't here because we loved it, we'd be somewhere else, being something else, like bankers or professional wrestlers or yoga instructors.

1: I don't think anyone loves being a banke---

0: And what makes it fun?

1: Well I guess it's nice to understand things.

0: Absolutely. So do you prefer working on problems you already understand?

1: No, I mean, not entirely. It's nice to understand things, but it's more challenging to work on a problem one doesn't entirely understand. So I suppose I prefer working on harder, more challenging problems. At least more challenging than hello world.

0: Would you say you prefer hard things over easy things?

1: Of course!

0: Well in that case I don't think you'll enjoy working under me.

1: What?

0: There are plenty of other places where you can learn about hard things, but this isn't one of them. I only teach the best bits. The easy bits.

1: You know you have kind of a reputation for being an extremely hard teac--

0: I only teach the best bits. And I only teach them about the easy bits. If they happen to find it hard, well that just goes to show why they're the best. But everything we do should be easy, in a fundamental sense. In a foundational sense.

1: Well this hasn't exactly been easy so fa---

0: If you can't get past hello world then I'm afraid the bits after this are only going to get harder.

1: I thought you said you only taught easy thi---

0: You still haven't answered.

1: You didn't let me!

0: I'm sorry. I'll give you all the time you need.

1: What was the question?

0: What's the point of programming?

1: Oh. Well, while I suppose that I personally like to understand things, I don't personally enjoy working only on things that I entirely understand in every detail prior to working on them, after all, I (speaking personally) also enjoy a good challenge, though not the sort of challenge that's challenging for the wrong reasons, or for uninteresting reasons, or for reasons that others might find interesting but which for me are at present too advanced to allow me to appreciate the lessons that the task might offer to someone with more background in the relevant areas.

_(Narrator: 1 pauses, as if waiting for a response from 0.)_

1: Are you still listening?

0: Yes.

1: Any thoughts on my answer?

0: You didn't give one.

1: Oh. Right. Well as I was saying, it's good to understand things, but not so much that you're bored. And it's good to be challenged, but not too much. And yes to be honest I chose this career because it's fun.

0: So what's the point of programming?

1: ... I'm not sure I can explain.

0: Let's change the question.

1: But I was just starting to feel I was making progress on一

0: What's NOT the point of programming?

1: Elephants.

0: That's not a terrible answer.

1: It's not a good answer though.

0: Why not?

1: Because I know you meant something more like "Of all the things we sometimes find ourselves doing as programmers, which of those things is definitely not the point of why we're programming to begin with."

0: Wonderfully stated question.

1: Thank you!

0: Now what's the answer?

1: Oh. Um... I don't know.

0: Suppose I told you to write me a hello world in the shell right now.

1: But I just did that.

0: Exactly.

1: Exactly what?

0: Well as you so eloquently put it:

```sudocode
!?programmers
```

1: Um... what was that?

0: It's a [[bin/bash|bash]] thing.

1: What kind of bash thing?

0: You didn't read the link did you.

1: No.

0: Understandable. I didn't think it would be an important conversation either, but it turned out to pretty important be once we got down in there. We made plans. Important ones. So go read it and add the plans to your todo list. I'll meet you back here when you're done. Here, I'll set the conversation's registers back to what they were before the link. _(ahem)_

```sh
cat << EOF

1: Exactly what?

0: Well as you so eloquently put it:

!?programmers

1: Um... what was that?

0: It's a bash thing.

EOF
```

goto: [[bin/bash|/bin/bash]]

## There

0: Why do we do programming in the first place?

1: Uh...

0: Exactly. I asked that question and you didn't know. So then I asked "What's NOT the point of programming?"

1: I don't know.

0: Suppose I told you to write me a hello world in the shell right now.

1: But I just did that.

0: Exactly. So what's NOT the point of programming?

1: Well it's certainly not to write the same program we just wrote a few minutes ago.

0: What if it's been a few hours?

1: Why does that change anything?

0: Or a few days?

1: I mean we could, but I don't see---

0: Years?

1: What exactly do you want me to say?

0: What's NOT the point of programming?

1: Repetition.

0: And?

1: Tedium.

0: For example?

1: Writing a program and then writing exactly the same program again later.

0: Why?

1: Because storage is infinitely cheaper than developer time these days, plus programs don't take up much space anyway.

0: So...

1: So writing the same thing over and over certainly isn't the point of programming.

0: Perfect! You're finally ready to answer my original question.

1: What was your orig---

0:

> _(Narrator: 1 looks around suspiciously, expecting this is some kind of trick.)_
> 
> 0: Well get on with it.
> 
> 1: ~ $ echo Hello world
>
> Hello world
> 
> 0: Keep going.
> 
> 1: I think I'm done.
> 
> 0: Suppose I claimed you were not done. What would you do next?

1: Oh. What would I do after this?

0: Exactly.

_(Narrator: 1 thinks for awhile.)_

1: I don't know what you're looking for.

0: I expected as much.

1: Hey!

0: When you want to run `cat` or `ls` or `grep`, do you start by opening an editor and reimplementing those programs from scratch?

1: Of course not.

0: Why not?

1: That would be absurd.

0: Why would it be absurd?

1: They already exist.

0: Where do they exist?

1: Where? Well, on this machine.

0: Where on this machine?

1: I don't know what you're getting at, but they're in `/bin` I guess.

0: Is there anything special about `/bin`?

1: Well not inherently. But usually `/bin` is in `PATH`, so the shell knows to look in there to find the programs whose names we type at the shell.

0: Good. So how can you make sure you never have to write this particular hello world program again?

1: I wouldn't actually mind having to write it again.

0: Valid point. Imagine it was some much larger piece of code.

1: In what sens---

0: Something less brief and not as entirely pleasant as this.

1: I can't say this experience has been brief or entirely pleasant.

0: Where would you put it?

1: In `/bin`.

0: That's a start. Do that now.

_(Narrator: 1 opens an editor.)_

```sh
!#/bin/sh
echo Hello world

:wq
```

1: It says permission denied.

0: It's also `#!` not `!#` but those are both solvable problems.

1: How can I solve the second one?

0: Well, put it somewhere else in the PATH.

1: `/bin`, `/usr/bin`, `/usr/local/bin`, ... I don't have write access to any of these places.

0: Do you have write access to the PATH?

1: I just said I don't. And then you said you do. And since it's becoming clear that the whole point of this rather lengthy and trivial exercise is to get me to install hello world, could you please install this code for me somewhere in the PATH?

0: No.

1: I give up. This is ridiculous.

0: Here, I'll give you a hint. If I didn't have write access to those places, I would do this:

```sh
f=$HOME/bin/hello

cat > $f << EOF
#!/bin/sh
echo Hello world
EOF

chmod +x $f
```

0: And now `hello` is in the PATH!

1: But you didn't modify the PATH.

0: Exactly!

1: I'm confused.

0: Here watch:

```sh
~ # hello
Hello world
```

Now you try.

1: Ok...

```sh
~ # hello
sh: hello: command not found
```

1: This is getting exhausting.

0: I can imagine.

1: Wait, can you run this line for me?

```
~ # echo $PATH
```

0: Finally a good question. Happy to.

```
~ # echo $PATH
/root/bin:/bin
```

1: Ok let me check mine.

```
~ # echo $PATH
/bin
```

1: I don't have `/root/bin` in my `PATH`.

0: Neither do I.

1: Look these riddles aren't helping. I'm just going to fix it.

```
~ $ export PATH="/root/bin:/bin"
~ $ hello
sh: hello: command not found
```

1: What the hell?

0: You may want to consider that these "riddles" are designed to help.

_(Narrator: 1 frowns at the terminal for a while.)_

1: Can you run this for me: `cat ~/.bashrc`

0: Absolutely.

```
~ # cat ~/.bashrc
export PATH="$HOME/bin:$PATH"
```

1: Ok, got it.

_(Narrator: 1 attempts to open ~/.bashrc and insert identical contents in there.)_

0: Is it working now?

1: No.

0: What's the problem.

```sh
~ $ cd $HOME
sh: cd: /home/user: No such file or directory
```

1: I'm so confused.

0: But not too confused. You're almost there.

1: Who's `user`?

0: That's you.

1: My name is---

0: No, 1 is your $UID. If you try to add a user with that name you'll hit the following:

```sh
~ # useradd -s /bin/sh 1
useradd: invalid user name '1': use --badname to ignore
```

1: So you just need to run `useradd --badname -s /bin/sh 1`. Can you please do that for me?

0: No.

1: Why not?

0: Because it's a bad name. You saw the error. I think you need a good name.

1: What's better than my ACTUAL name?

0: Well, my name is `root` and I'm `$UID 0` with prompt `~ #`.

1: So?

0: So I think it's only appropriate for you to be `user` with `$UID 1` and prompt `~ $`.

1: That does have a nice ring to it.

0: I thought so too.

1: Now what?

0: Well you're going to need a home directory. So naturally I'll run the following on my end, for you:

```sh
useradd -m -s /bin/sh user
```

0: You should be able to figure out the rest for yourself.

1: How do I log in?

0: Any tty will do. Your password is `password`.

1: Isn't that a bit insecure?

0: Against what?

1: What do you mean?

0: There's no one else here.

1: ...

_(Narrator: 1 attempts to log in and figure this out once and for all.)_

1: I know how to log in!!

```
1: I know how to log inecho '_(Narrator: 1 attempts to log in and figure this out once and for all.)_'
bash: 1:: command not found
```

1: What just happened?

0: Sorry, history expansion again. It's really an awful feature. We need to fix that bug. Not that _that_ was the bug. But still. We need to fix that bug in bash as soon as possible.

1: Looking forward to it. :)

0: In this case though it was your fault. You need to put single quotes around those `'!!'` if you know what I mean, before you echo them. Otherwise history expansion shows up and ruins everything. That's not our bug. That's just how it works.

1: I'm gonna go log in as myself now. Be right back.

_(Narrator: 1 attempts to log in and figure this out once and for all.)_

1: I know how to log in'!!'

0: Much better.

_(Narrator: Time passes, as 1 works on logging in and finally finishing hello world.)_

1: _(Talking to 1self)._ Ok, `cd` into `$HOME`, `mkdir bin`, put the code in `bin/hello`, add `export PATH="$HOME/bin:$PATH"` to `~/.bashrc`. Why isn't it... Oh ok, source `~/.bashrc`, try to run it, great! Got it.

_(Narrator: As 1 returns to /bin to show 0, 0 seems to be focused on something else.)_

0: Oh that's good.

```
    unzip; strip; touch; grep;
    finger; mount; fsck;
    more; yes; umount; sleep;
```

1: Um, 0?

0: Oh 1!! I didn't see you there.

```sh
0: Oh, 1echo 1: Um, 0? I didn't see you there.
>>
```

_(Narrator: 1's sudden return seems to have surprised 0, triggering history expansion, before 0 then tripped over 0self by using a single quote. (Our characters now seem to be stuck at $PS2. Here, let's help them out.)..)..._

```sh
'
```

0: `bash: 0:: command not found`

1: What?

0: Nothing.

1: What were you looking at?

0: Nothing. It's nothing. Just an old joke.

1: ...Are you sure?

0: Of course.

1: ...

0: And a very good joke at that\\!\\!

1: ...

0: So how did it go?

1: I got it working.

0: Good job!

1: Good job? But that was all trivial. Except for talking to you, which was rather diffic---

0: Of course it was trivial!

1: Then what was the point of all that?

0: You're done!

1: Done with WHAT?

0: Hello world.

1: What?

0: You told me to start at the beginning.

1: And you said "everyone's wrong about everything."

0: And you asked for an example.

1: And you said "Hello world."

0: Exactly!

1: Exactly what?

0: That's how they're wrong about hello world. They never finish.

1: I'm not entirely following.

0: That's a very important thing to learn!

1: What am I supposed to have learned from that?

0: How to finish hello world.

1: Can you stop and explain?

0: Of course, head over with me to `/etc/principles`.

_(Narrator: Our characters head over to [[01 - Finish Hello World|/etc/principles]], where 0 makes a new file.)_

## First Principles

1: What was that bit at the end?

0: What bit?

1: The So sayeth and all that. Who's the L||D?

0: Well || is "OR".

1: So it's L or D?

0: Exactly. Like the Lord or whatever.

1: What?

0: It's also the linker.

1: Explain?

0: Or the loader. Same thing in a way.

1: I have no idea what you're talking about.

0: Sure you do! The dynamic linker. Or dynamic loader. Also known as `ld`. 

1: Why's the abbreviation backwards?

0: How do you mean?

1: Shouldn't "dynamic linker" or "dynamic loader" be `dl`, not `ld`?

0: Well no that's not what it stands for, so it's not backwards.

1: You just said---

0: But even if it was backwards, it still wouldn't be backwards.

1: You're making zero sense.

0: That's how they used to write!

1: That's how who used to write?

0: The authors. Of the old code bases.

1: Still not following.

0: That's ok. You will soon.

1: You sure about tha---

0: Of course, follow me.

_(Narrator: 1 proceeds to follow 0, in several ways.)_

goto: [[babel|/bin/babel]]