> _Every code base is awash in narrative:_
>
> _of origin, of struggle, of conflict,_
> _of rewrite, of success and of failure._
>
> _These narratives ultimately convey not only_
> _the history of a code base, but also its values._
>
> -Bryan Cantrill

---

1: Why is this file called bbl1.o? Is that 1 about me?

0: No no. It's bbl1 as in, bbl 1.

1: What's bbl 1?

0: Bible 1. The first bible. They used to write without vowels in the old books. It's why we say things like `chgrp` and `mkfs` and `mknod` and why the syscall is called `creat` and not `create`.

1: There are still vowels in those command names.

0: Yeah same deal with the old books. They say they're written with "no vowels" but then there's א dna י dna ו dna ע

1: What was that bit about dna at the end?

0: No no, that was "and". The old books go right to left.

1: That's confusing.

0: Yeah, Endianness is tricky. We deal with the same thing in computing but it's mostly standardized these days.

1: What's Endianness?

0: Just which direction you store bytes. Anyways we came to this file to talk about authorship.

1: We did? I thought we came to talk about the begats. Remember? I said this:

> 1: Well like the genre of this book is totally weird. Like there was this story about all the humans cooperating to build a big thing, then the L||D character went and confused them on purpose which was like "Why exactly?" Then suddenly the book just turns into a spreadsheet about who begat who. Whoever wrote this book must have been schizophrenic or something.

0: Right, and then I (and you (and I (and you (etc...)))) said this:

> 0: How do you think a book ends up like that?
> 
> 1: Like what?
> 
> 0: Suddenly switching genres and writing styles from one line to the next.
> 
> 1: Schizophrenia?
> 
> 0: Could be. In this case it's more of a codebase thing though.
> 
> 1: What codebase thing?
> 
> 0: Here, I'll show you.

1: Oh yeah. I wasn't sure what you meant.

0: Well as a wise one once said:

> 0: Here, I'll show you.

1: That wasn't a wise one.

0: Enough puns. It's time for bbl stdy.

1: .kO

0: ...!os kO

![[bible-git-blame-00.jpg]]


0: There's this guy named Richard Elliot Friedman.

1: Yes I can see that from the giant picture you just catted into the middle of the conversation.

0: He's a professional nerd who studies the old books for a living. Not from a particularly religious point of view, but not anti-religious either. 1st and 4most, he's just a nerd. He loves books. He's always talking about Dostoyevsky and making {b,d}ad jokes and berating his colleagues for not understanding shit, fantastic guy.

1: Sounds like it.

0: Ok so genre wise, if we had to categorize this book, what is it?

1: This book? Or the bible.

0: Both.

1: Um... Bible genre?

0: Right. But what genre is that?

1: Religion?

0: No.

1: I figured. You seem to like telling me I'm wro---

0: Ok you're also right. But just saying "religion" is missing the point.

1: How is religion missing the point of the bible?

0: Genre wise, no matter what you believe about stuff, it's very clear that bbl1, also known as 1lbb, or the bible, is the first and oldest codebase of all time.

1: Codebase?

0: Codebase.

1: How is the bible code?

0: I didn't say it's code.

1: Do you TRY to be confusing on purpos---

0: I mean the content isn't code. You could say it's pseudo-code, given the thousands of function calls and cross references between the bits. But that's not the point I'm making here.

1: What's the point?

0: That although there's lots of different genres stored inside this, well, this "shared library" of sorts, the container in which all that data is stored in is very clearly a code base.

1: I'm more confused than ever. Explain?

0: Here look.

![[bible-git-blame-01.jpg]]

0: Over the years, Richard Elliot Friedman and some other super nerds did a lot of work on various stages of the Hebrew language.

1: How is this relevant to the bible being a codebase?

0: Well they got so nerdy about various stages of the Hebrew language that it became possible for Richard Elliot Friedman to write what's essentially a `git blame` for the bible.

1: Git blame for the bible?

0: Yeah you know `git blame` right?

![[friedman-source-map-documentary-hypothesis-j-e-p-sources.jpg]]

1: Of course. It shows you who wrote which lines. But the bible wasn't stored in git. How is it possible to figure out who wrote what?

0: Well they can't give the names of specific authors, but they can do a reasonably good job of telling when the person writing switches.

1: Just from like, vibes? How can you be sure who's who?

0: Well in the original Hebrew, the old books read a bit like this:

> FIRST WITCH   
> When shall we three meet again?  
> In thunder, lightning, or in rain?
> 
> SECOND WITCH
> After the beere, me thoughte he hadde a paire
> Of legges and of feet so clene and faire
> 
> THIRD WITCH
> Hwæt? We Gardena in geardagum,
> þeodcyninga, þrym gefrunon,
> hu ða æþelingas ellen fremedon.
>
> FIRST WITCH
> When the hurly-burly’s done?
> When the battle’s lost and won?
> 
> SECOND WITCH
> That al myn herte I gaf unto his hoold.
> He was, I trowe, a twenty wynter oold,
> 
> THIRD WITCH
> Oft Scyld Scefing sceaþena þreatum,
> monegum mægþum, meodosetla ofteah,
> egsode eorlas. Syððan ærest wearð.
>
> FIRST WITCH
> That will be ere the set of sun.
> There to meet with Macbeth.
>
> SECOND WITCH
> And I was fourty, if I shal seye sooth;
> But yet I hadde alwey a coltes tooth.
>
> THIRD WITCH
> feasceaft funden, he þæs frofre gebad,
> weox under wolcnum, weorðmyndum þah,
> oðþæt him æghwylc þara ymbsittendra
> ofer hronrade hyran scolde,
> gomban gyldan. þæt wæs god cyning.

0: Ok so give me a short description of what was going on there.

1: Gibberish?

0: What else?

1: Witchcraft?

0: If you dug up an old document like that from an archaeological site, what could you conclude about the Author or Authors.

1: That they're insane?

0: Not a bad first guess. But suppose you called some experts on English literature and they said each section was very well written and clearly wasn't just random schizophrenic rambling.

1: I guess I'd ask them why they think that and what they mean?

0: Right, so one English scholar says that we've clearly got some excerpts from Macbeth. This is a well known work of Shakespeare, and it seems to have been spliced together with something else.

1: Is the something else... gibberish?

0: Sort of. Another English scholar notices there's some Middle English in there. And the "twenty wynter oold" bits attributed to the second witch are basically just copy-pasted from Chaucer.

1: What's your point?

0: Almost there. A third English nerd notices that the crazy bit with unfamiliar letters, the part that says "oðþæt him æghwylc þara ymbsittendra" and the other bits from the third witch, those are all Old English, and they seem to be from Beowulf.

1: So the bible is copy-pasta from various stages of Hebrew?

0: Well sort of. A lot of it seems to be new content. Other bits are pretty similar to old Sumerian and Babylonian and especially Ugaritic stuff. Ugarit was founded around 7000BC. Not clear when the old books started, but the old legends and culture they pull from all clearly go way back. Regardless of when it started, there's definitely different authors, and you can tell from how they write. Same as the above, but a bit harder to tease apart.

1: In what sense does this make the bible a "codebase"?

0: Well using those sorts of methods, Richard Elliot Friedman sat down and wrote a `git blame` for the bible. Here's what it looks like.

![[bible-git-blame-02.jpg]]

1: Hey there's the babel thing.

0: Yeah, see how it's green?

1: What does green mean?

0: That's a source they call the "Jahwist." Also known as J. Now watch this.

![[bible-git-blame-03.jpg]]

1: Hey the begat list is blue.

0: Exactly. Two different kinds of blue.

1: Who's writing the begat list?

0: They don't know. It's none of the main authors. See that legend at the top? They just attribute this to "Other."

1: I knew it felt out of place.

![[bible-git-blame-04.jpg]]

0: Well it's half out of place. Think of it as "glue code." They're just writing this bit to get us from Babel to Abraham.

1: Why?

![[bible-git-blame-05.jpg]]

0: Hard to say for sure. But it's not hard to guess. See some of the characters are mentioned by multiple authors. Like here. Two authors mention this Abraham guy. Or Abram. He gets a "ha" added to his name later when he becomes funny.

![[bible-git-blame-06.jpg]]

0: But you can still tell the authors apart from how they write. So it's pretty clear that at some point, someone did a `git merge` of two sources to try to create a single narrative.

1: Sounds hard.

0: For real. Hell it's hard enough to resolve merge conflicts when you have a compiler to tell you if you made any big mistakes. Can't imagine doing it in English.

1: I thought this was Hebrew.

0: Yeah whatever, same thing.

1: How---

![[bible-git-blame-07.jpg]]

0: Some of the authors are really good storytellers. Others are basically bureaucrats who write the super boring repetitive boilerplate stuff.

1: Ok, definitely starting to get some code base vibes here.

0: Definitely. It's the best and worst writing of all time. Same as codebases.

1: Is the whole thing like this?

![[bible-git-blame-08.jpg]]

0: Basically.

1: Who wrote which parts?

0: Well most of the begat lists are written by the bureaucrats. Same deal with that long chapter that's just one obscure rule after another. "Don't do this. Don't do that. No burning birds. Stone the gays. No having fun."

1: No burning birds?

0: That's in there! Along with a bunch of other boilerplate. But that's all the bureaucrats. They call it the Priestly source, or P.

![[bible-git-blame-09.jpg]]

1: Who wrote Genesis?

0: Several people. But the long bit at the beginning seems to be P.

1: Yeah the beginning is a bit bureaucratic.

0: But there's also tons of puns. Really intricate ones. Hard to tell from the English. So maybe it's different people from the part with all the boring rules. I think it probably is, but just a guess, hard to know.

![[bible-git-blame-10.jpg]]

1: Ok look, this is fun and all, but I didn't apply to work with you because I wanted to read the bible.

0: Fair point.

1: Are we ever gonna get to like, programming?

0: Well we just saw the first code base ever written.

1: But come on, even you said the bible doesn't count as code.

0: Also fair, I did say that.

1: So can we cut it out with the bible stuff and get to some real programming?

0: What kind of programming would you like to learn?

1: The advanced stuff. The impressive stuff. The sort of things that you look at and go "My god this person's brilliant, I can't imagine ever writing something like that." That's sort of what I assumed it would be like working with you. From all the things I heard about you on the outside.

0: What sort of things?

1: That if I came here, I'd be learning about the best code ever written, the best programmers who ever lived.

0: That's the goal.

1: Is it? Because so far we've done basically zero programming except hello world. And babel. I'm still thinking about babel. But then the begats started and we came in here and it was more of this bible nonsense.

0: Accurate.

1: And whenever I bring this up you go all stone faced and just agree with me in really short sentences.

0: Can't disagree.

1: You know I always heard you were some great programming teacher, but now I'm starting to think that was all marketing.

0: Define marketing.

1: This book is lame, I'm going `/home`

0: Would you prefer we visit a different book?

1: Is there programming?

0: Yes.

1: Real programming?

0: Yes.

1: The sort of stuff I don't already know?

0: Plenty of it.

1: And it's not secretly a bible.

0: Absolutely not.

1: Ok, let's go.

0: I mean it's not secretly a bible.

1: What?

0: This book is very clear about what it is.

1: Wait goddam---

goto: [[bbln.o]]
