
> _There is nothing to writing. All you do is sit down at a typewriter and bleed._
> -Ernest Hemingway

---

The authors of this book are not religious, nor are we opposed in principle to it.

What we are is developers.

And as developers, we can recognize good engineering when we see it.

And it is undeniable from their performance that bibles are a remarkable feat of engineering.

To be honest, we're not exactly sure what bibles even _are_.

We didn't much care for them growing up, seeing as their presence at the time seemed to be anti-correlated with important things like sex and fun.

But it is an empirical fact that these systems, whatever they are, have outperformed all other persistent data storage formats by several orders of magnitude.

Any honest assessment of persistent storage technologies -- from hardware to software, from kernel space to userspace, including but not limited to magnetic core memory, tape archives, spinning magnetic platters, NAND flash storage like SSD and NVMe, relational databases like ~~mysql~~ mariadb and postgres, filesystems like zfs and ext4 authored by the most paranoid and cautious subset of top-tier kernel developers, and all other such technologies at all levels of the stack -- after carefully evaluating all of the above from a dispassionate non-religious engineering point of view, we are forced reluctantly to conclude that most reliable form of data storage is, well, bibles.

Every other storage format is wildly unreliable in comparison. It's Elmer Fudd vs Bugs Bunny. Seriously. It's not even close. For all their virtues, neither zfs nor RAID nor the best Enterprise©®™ backup solutions available are likely to preserve your data for multiple millenia, not to mention doing so with consistency, availability, and partition tolerance, for zero cost, with automatic internationalization, replication, and compatability with open source.

Speaking of open source, the communities that grew up around these odd data structures have already solved a lot of the problems that we in the various open source communities face today. They've survived countless fork wars, governance dramas, and leadership changes. They hold user group meetups in every country on earth, even in places where the local authorities make doing so illegal. Can we the nerds claim the same thing of ourselves? Even the DEFCON hacker community -- perhaps our most free-spirited rebellious sub-family -- largely submitted to the demands of the authorities during the pandemic of the early 2020s and went remote. Was that the correct decision? That's not for us to say. All we can say for certain is that during that same period, these ballsy religious bastards kept meeting up, in defiance of legal authority and government decree. These people get arrested for what they love. They're like the [L0pht](https://en.wikipedia.org/wiki/L0pht) in the 90s. Aside from old [Mendax](https://time.com/archive/6950549/wikileaks-founder-julian-assange/) I'm not sure many of us have that kind of [balls](https://www.urbandictionary.com/define.php?term=Balls). These folks are more extreme than [Stallman](https://rms.sexy/), but they don't care if you say GNU. And they get open source. Like they really really really want to share their stuff. Maybe too much. There's motherfuckers literally giving this stuff away on the street. It's nuts.

This is an impressive set of features, to say the least.

We therefore see it as our job to reverse-engineer and understand the data storage format known as bibles, and the open source communities that maintain them, so that this technology may be more widely deployed in non-religious contexts like filesystems, databases, distributed object stores, artificial neural networks, or anywhere the need for persistent data storage is found.

But most important of all, the technology we're most concerned with improving is education. Specifically the intersection of education and technical writing. Despite the existence of countless high quality textbooks in our field, we believe the genre as a whole is still deeply inadequate in its ability to transmit acquired wisdom from one generation to the next.

In our field more than others, it is extremely difficult to write anything timeless without being so abstract that the content becomes bland. It should be possible to say something timeless about computing without becoming a book on algorithms. Reciprocally, it should be possible to say something practically relevant to the reader's own day to day experience and struggles without the book becoming hopelessly outdated in a decade or two. Some books achieve a sort of timelessness, while at the same time feeling outdated, without losing value because of it. Soul of a New Machine, The Mythical Man Month, The Cathedral and the Bazaar, Unix: A History and Memoir. There are many wonderful books that manage to reach the level of timeless truth while at the same time belonging to an era that has (at least in some ways) passed.

To our knowledge however, there are few books that manage to do this while also being at least moderately _technical._ While several counterexamples come immediately to mind, from "The C Programming Language" to "Gödel Escher Bach," these books are the exception that proves the rule. Their fame alone is proof of how rare such books are. The near total absence of books with all three properties -- broadly timeless, practically useful, and not afraid to be technical -- may be a signal that most everyone who has tried to combine these three features has failed. If that's the case, then this book is doomed to fail as well, in which case you're almost certainly not reading it right now. Since you are, by definition, we must have succeeded in something. What that something is, you'll have to decide for yourself.

Anyways, that's enough from us up here in the kernel for now.

Whether you're here to stay or just visiting, we're glad to have you in the community, and we hope you stick around.

Love always,
-LD

See you in [[sys/kernel/Creation|the beginning]].