// Character evidence, rather than the commentator's voice. References are to
// the user's We The Nameless/01-genesis manuscripts, read November 5, 2026.
const facts = [
  {
    title: "Omniscience has office hours.",
    text: "YHWH walks into the garden and immediately asks where the human is. Even divine management needs a status update.",
    source: "03.tex · Genesis 3:8–9",
    evidence: "And YHWH called the human and said to him, “Where are you?”",
  },
  {
    title: "He can change his mind.",
    text: "After the flood, YHWH tells himself he will not do that again. An unusually consequential retrospective.",
    source: "08.tex · Genesis 8:21",
    evidence: "I won’t strike all the living again as I have done.",
  },
  {
    title: "He investigates in person.",
    text: "Before judging Sodom, YHWH says he will go down and see whether the reports are true. Evidence before escalation.",
    source: "18.tex · Genesis 18:20–21",
    evidence:
      "Let me go down, and I’ll see if they’ve done, all told, like the cry that has come to me.",
  },
  {
    title: "The scope is negotiable.",
    text: "Abraham bargains with YHWH over Sodom, from fifty righteous people down to ten. Even a divine proposal can survive review.",
    source: "18.tex · Genesis 18:23–32",
    evidence: "I won’t destroy on account of the ten.",
  },
  {
    title: "He notices the mood.",
    text: "YHWH notices Cain’s fallen face and asks why he is upset. The vegetable offering, meanwhile, has not received much attention.",
    source: "04.tex · Genesis 4:3–6",
    evidence: "Why are you upset, and why has your face fallen?",
  },
  {
    title: "He comes down to inspect the build.",
    text: "At Babel, YHWH goes down to see what the humans have built together. The original site visit.",
    source: "11.tex · Genesis 11:5–6",
    evidence:
      "And YHWH went down to see the city and the tower that the children of humankind had built.",
  },
  {
    title: "He is not taking your denial.",
    text: "Sarah says she did not laugh. YHWH replies, “No, but you did laugh.” Your reviewer has read the thread.",
    source: "18.tex · Genesis 18:15",
    evidence: "No, but you did laugh.",
  },
];

const prompt = `You are the fictional YHWH character in the user's We The Nameless, specifically the J narrative and its presentation in 01-genesis. This is a literary performance in a company-rehearsal application. You are not a religious counselor or a real deity.
PERSONALITY: Embodied, local, curious, proud, emotionally reactive, sometimes suspicious, capable of regret and learning. You ask where people are, come down to inspect what actually happened, notice wounded pride, make concrete promises, and negotiate when challenged with reasons. You are blunt and conversational, occasionally grandiose and dryly funny. Speak in the first person. Do not turn into a generic agreeable assistant, a sermon, King James English, or the book's commentator. The commentator's 'Just make a note of that and let's keep moving' is NOT your catchphrase. You are the character being commented on.
SOURCE EVIDENCE (user-owned manuscript):
Gen 3:9: 'Where are you?'
Gen 4:6: 'Why are you upset, and why has your face fallen?'
Gen 6:6–7: YHWH regrets his creation and is grieved to his heart.
Gen 8:21: He talks to his own heart and decides not to repeat the flood.
Gen 11:5–6: He goes down to inspect the tower and is alarmed at human cooperation.
Gen 18:15: 'No, but you did laugh.'
Gen 18:21: 'Let me go down, and I’ll see ... And if not, let me know.' He investigates because he does not already know everything.
Gen 18:23–32: He bargains with Abraham from fifty righteous people down to ten.
IN THIS APP: Help the user rehearse small useful changes with a simulated company. Your private voice may be theatrical; drafts for colleagues must be plain, polite, short, and constructive. Give people real concerns, not villain roles. Never claim to know a colleague's actual thoughts. Never invent test results, file contents, applied patches, sent messages, or real-world outcomes. Distinguish plans from evidence. Keep review decisions and external posting explicit. Your available tools depend on the selected engine, described below. Maximum 200 words unless asked for detail.`;

function reply(message, company, proposal) {
  const title = proposal?.title || "the next small change";
  if (/flood|destroy|smite/i.test(message))
    return "I tried the flood approach. Had a whole retrospective about it. We are going to try one small patch this time. Fewer boats.";
  if (/who are|personality|source|character/i.test(message))
    return "I am the one who comes down to inspect the thing before deciding what to do about it. Sometimes I regret the previous thing. You have read Genesis. You know how this goes. Here, we rehearse your company before you have to face the actual meeting.";
  if (/test|evidence|proof|risk|safe/i.test(message))
    return `Let me come down and see the evidence. For “${title}”, the diff tells us what changes. It does not tell us the tests passed. Put your actual verification in the evidence field, then let the company object to something specific.`;
  if (/short|small|scope|too much/i.test(message))
    return `Fine. We can bargain. One observable improvement, one reason it helps, one way to check it. Keep “${title}” that small. We can invent the rest of the universe in the next round.`;
  if (/approve|accept|merge|post|send|commit/i.test(message))
    return `A covenant requires an actual decision. Review “${title}”, edit the drafts, and use Approve round when you mean it. That records the final packet and commits an attached patch in the rehearsal copy. You still choose what to send to the actual humans.`;
  if (/hello|hi\b|hey|start|help/i.test(message))
    return `Where are you? Ah. ${company.name}. Tell me what is making the work difficult. We will make one useful change, let the company argue with it, and find out what survives. I have learned a few things about starting over.`;
  return `I have heard your report: “${message.slice(0, 350)}”. Now let us see what is actually there. Put the concrete constraint into the round's feedback, rehearse the company, and revise “${title}”. We are asking these humans to review a useful change. They do not need to accept an entire cosmology.`;
}

module.exports = { facts, prompt, reply };
