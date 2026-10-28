import type { WorksheetDocument } from "../schema/document";
import { act, baseDoc, claim, fig, item, key, sec } from "./helpers";

const fluentAudience = (ageMin: number, ageMax: number, prior: "new" | "some" | "confident"): WorksheetDocument["audience"] => ({
  ageMin,
  ageMax,
  readingDemand: "fluent",
  priorKnowledge: prior,
  intendedUse: "classroom",
  language: "en",
  regionalConventions: { spelling: "en-CA", units: "metric" },
  supportPreferences: { vocabularySupport: true, sentenceStarters: true, oralAlternatives: false, drawingAlternatives: false },
});

// ---------------------------------------------------------------- fractions

export function fractionsSample(): WorksheetDocument {
  return baseDoc({
    question: "What makes a fraction equivalent?",
    title: "What makes a fraction equivalent?",
    subject: "Mathematics · Fractions",
    format: { kind: "custom", targetStudentPages: 3, estimatedMinutes: 40, grouping: "individual" },
    audience: fluentAudience(9, 11, "some"),
    directAnswer: "Two fractions are equivalent when they name the same amount of the same whole. You can make an equivalent fraction by multiplying (or dividing) the numerator and the denominator by the same number.",
    learningPlan: {
      questionType: "what",
      scope: "Equivalent fractions of one whole, shown with fraction bars; finding equivalents by multiplying numerator and denominator by the same number.",
      learnerAssumptions: ["Knows what numerator and denominator mean", "Can multiply within 100"],
      prerequisites: ["Fractions as equal parts of a whole", "Multiplication facts"],
      objectives: [
        { id: "obj-1", text: "Explain why two fractions are equivalent using equal amounts of the same whole", evidence: "Uses a bar model or words about ‘the same amount’" },
        { id: "obj-2", text: "Find and check equivalent fractions by multiplying numerator and denominator by the same number", evidence: "Correct missing numerators and correct equivalent/not-equivalent decisions" },
      ],
      misconceptions: [
        { id: "mis-1", text: "Adding the same number to the top and bottom keeps a fraction the same", correction: "Only multiplying or dividing both by the same number keeps the amount the same", basis: "plausible-not-verified", sourceIds: [] },
        { id: "mis-2", text: "A bigger denominator always means a bigger fraction", correction: "More pieces means smaller pieces; 4/8 is the same as 1/2", basis: "plausible-not-verified", sourceIds: [] },
      ],
      explanationSequence: ["Same whole, same amount", "Bar model shows 1/2 = 2/4 = 4/8", "Split each piece into k parts: multiply top and bottom by k", "Worked example, then a faded example", "Check pairs; explain an error"],
      selectedStrategies: [
        { id: "worked-example", rationale: "A full worked example comes before independent practice." },
        { id: "faded-example", rationale: "The second example leaves the last steps for the learner." },
        { id: "examples-and-non-examples", rationale: "Learners decide which pairs are and are not equivalent." },
        { id: "misconception-address", rationale: "Learners explain why ‘add one to top and bottom’ fails." },
        { id: "text-visual-integration", rationale: "Fraction bars make the ‘same amount’ idea visible." },
      ],
      assessmentMap: [
        { objectiveId: "obj-1", activityIds: ["act-error"] },
        { objectiveId: "obj-2", activityIds: ["act-worked", "act-check"] },
      ],
      visualPlan: [{ purpose: "Show 1/2, 2/4 and 4/8 cover the same length", diagramType: "fraction-bars", lossIfRemoved: "The ‘same amount of the same whole’ meaning would be stated, not seen", diagramId: "fig-bars" }],
      supportOptions: ["Fraction bars to shade", "Multiplication table"],
      extensionOptions: ["Explain why dividing top and bottom also works"],
      reviewPlan: { retrievalCard: true, suggestedReviewDays: [2, 7, 21] },
      rationale: "Learners who already know what a fraction is need a clear model of ‘equivalent’. The bar figure shows the meaning, the worked and faded examples teach the procedure, and the check and error-analysis tasks separate understanding from rule-following. Every numerical answer is checked by code.",
    },
    sections: [
      sec("sec-hook", "hook", 1, { body: "Ana cuts a sandwich into 2 equal halves and eats one. Ben cuts the same kind of sandwich into 4 equal quarters and eats two. Who ate more?" }),
      sec("sec-explain", "explanation", 1, {
        heading: "Same whole, same amount",
        body: "Ana ate 1/2 and Ben ate 2/4. They ate the **same amount**: Ben's sandwich was just cut into more, smaller pieces.\n\nFractions that name the same amount of the same whole are called [[equivalent fractions]]. In the bars below, each bar is the same length — the same whole. The shaded part is the same length too.\n\nIf you split every piece into 2, there are twice as many pieces, and twice as many are shaded. That is why multiplying the [[numerator]] (top) and the [[denominator]] (bottom) by the same number gives an equivalent fraction.",
        claimIds: ["claim-1", "claim-2"],
      }),
      sec("sec-fig", "diagram", 1, { diagramId: "fig-bars" }),
      sec("sec-worked", "activity", 1, { activityId: "act-worked" }),
      sec("sec-check", "activity", 2, { activityId: "act-check" }),
      sec("sec-error", "activity", 2, { activityId: "act-error" }),
      sec("sec-recall", "recall", 2, { heading: "From memory", body: "Cover page 1. In your own words: what makes two fractions equivalent?" }),
      sec("sec-next", "next-question", 2, { heading: "Wonder next", body: "How can you tell which of two fractions is bigger when they are not equivalent?" }),
    ],
    activities: [
      act("act-worked", {
        type: "complete-worked-example",
        title: "Worked example, then your turn",
        instructions: "Read the steps for 2/3. Then finish the steps for 3/4.",
        objectiveIds: ["obj-2"],
        items: [
          item("a", "Find a fraction equal to 2/3 with a denominator of 12.", 0, { givenAnswer: "12 ÷ 3 = 4, so multiply the denominator by 4. Multiply the numerator by 4 too: 2 × 4 = 8. Answer: 8/12." }),
          item("b", "Find a fraction equal to 3/4 with a denominator of 20. What do you multiply 4 by to get 20?", 1),
          item("c", "So 3/4 = ___ /20", 1),
        ],
        computations: [{ kind: "missing-numerator", itemId: "c", a: [3, 4], denominator: 20, expected: 15 }],
        supportOptions: { sentenceStarter: "I multiply both by … because …", wordBank: [] },
      }),
      act("act-check", {
        type: "sort",
        title: "Equivalent or not?",
        instructions: "Tick one box for each pair. Check by multiplying, or by drawing bars.",
        objectiveIds: ["obj-2"],
        responseMode: "tick",
        items: [
          item("a", "2/5 and 4/10", 0, { options: ["equivalent", "not equivalent"] }),
          item("b", "3/4 and 6/9", 0, { options: ["equivalent", "not equivalent"] }),
          item("c", "5/6 and 10/12", 0, { options: ["equivalent", "not equivalent"] }),
          item("d", "1/3 and 3/6", 0, { options: ["equivalent", "not equivalent"] }),
        ],
        scored: true,
        marks: 4,
        computations: [
          { kind: "fraction-equivalence", itemId: "a", a: [2, 5], b: [4, 10], expected: true },
          { kind: "fraction-equivalence", itemId: "b", a: [3, 4], b: [6, 9], expected: false },
          { kind: "fraction-equivalence", itemId: "c", a: [5, 6], b: [10, 12], expected: true },
          { kind: "fraction-equivalence", itemId: "d", a: [1, 3], b: [3, 6], expected: false },
        ],
      }),
      act("act-error", {
        type: "explain-misconception",
        title: "Spot the mistake",
        instructions: "Sam says: “1/2 is the same as 2/3, because I added 1 to the top and 1 to the bottom.”",
        objectiveIds: ["obj-1"],
        items: [item("a", "Is Sam right? Explain, using a drawing or the word _amount_.", 4)],
        supportOptions: { sentenceStarter: "Sam is … because 1/2 and 2/3 …", wordBank: [] },
      }),
    ],
    answerKey: [
      key("act-worked", {
        answer: "b) 4 × 5 = 20, so multiply by 5. c) 3 × 5 = 15, so 3/4 = 15/20.",
        itemAnswers: [
          { itemId: "b", answer: "5" },
          { itemId: "c", answer: "15" },
        ],
        reasoning: "Multiplying numerator and denominator by 5 splits each quarter into 5 equal parts.",
        commonErrors: ["Multiplying only the denominator (answer 3/20)", "Adding 16 to the denominator and 16 to the numerator"],
      }),
      key("act-check", {
        answer: "a) equivalent b) not equivalent c) equivalent d) not equivalent",
        itemAnswers: [
          { itemId: "a", answer: "equivalent (×2)" },
          { itemId: "b", answer: "not equivalent (3 × 9 = 27, but 4 × 6 = 24)" },
          { itemId: "c", answer: "equivalent (×2)" },
          { itemId: "d", answer: "not equivalent (3/6 = 1/2)" },
        ],
        reasoning: "Equivalent pairs come from multiplying top and bottom by the same number. Cross-multiplying gives equal products only for equivalent pairs.",
        marks: 4,
      }),
      key("act-error", {
        answer: "Sam is not right. 1/2 is half of the whole, but 2/3 is more than half. Adding the same number to the top and bottom changes the amount; only multiplying or dividing both by the same number keeps it the same.",
        reasoning: "Look for an explanation about the amount (or a correct bar drawing), not just the rule.",
        rubric: [
          { level: "Secure", descriptor: "Says Sam is wrong and shows or explains that the amounts differ." },
          { level: "Developing", descriptor: "Says Sam is wrong and states the multiply rule without explaining the amount." },
          { level: "Not yet", descriptor: "Agrees with Sam." },
        ],
      }),
    ],
    diagrams: [
      fig("fig-bars", { type: "fraction-bars", claim: "all-equivalent", showFractionLabels: true, bars: [{ numerator: 1, denominator: 2, label: "1/2" }, { numerator: 2, denominator: 4, label: "2/4" }, { numerator: 4, denominator: 8, label: "4/8" }] }, {
        caption: "Three bars of the same length. The shaded parts are the same length, so 1/2 = 2/4 = 4/8.",
        altText: "Three equal bars split into 2, 4 and 8 parts, with 1, 2 and 4 parts shaded; the shaded lengths match.",
        longDescription: "Three bars of equal length are stacked. The first is split into 2 equal parts with 1 shaded and is labelled 1/2. The second is split into 4 equal parts with 2 shaded, labelled 2/4. The third is split into 8 equal parts with 4 shaded, labelled 4/8. In every bar the shaded part ends exactly halfway along.",
        teachingPurpose: "Shows that equivalent fractions are equal amounts of the same whole.",
        lossIfRemoved: "The meaning of ‘equivalent’ would be a rule only, without the picture of equal amounts.",
        widthPct: 85,
      }),
    ],
    teacherNotes: {
      overview: "Learners connect a picture of equal amounts with the multiply-top-and-bottom procedure, then use it to check pairs and to explain a common error.",
      materials: ["Optional: paper strips for folding"],
      safety: [],
      differentiation: { moreSupport: "Provide blank fraction bars and a multiplication table; do item 2 with a partner.", extension: "Ask: why does dividing top and bottom by the same number also give an equivalent fraction? Find three fractions equal to 12/18." },
      misconceptionNotes: "The ‘add the same number’ error often comes from treating the numerator and denominator as separate whole numbers. A folded paper strip helps.",
      reviewSuggestions: "Review cards: day 2 — find a fraction equal to 3/5; day 7 — is 4/6 equal to 6/9?; day 21 — explain to someone why 2/4 = 1/2.",
      curriculum: { status: "none", items: [] },
      sensitivity: { level: "none", notes: "", adultSupervision: false },
    },
    claims: [
      claim("claim-1", "Fractions that name the same amount of the same whole are equivalent.", ["sec-explain"], { evidenceStatus: "supported", statusAssignedBy: "deterministic", uncertainty: "Mathematical definition." }),
      claim("claim-2", "Multiplying the numerator and denominator by the same non-zero number gives an equivalent fraction.", ["sec-explain"], { evidenceStatus: "supported", statusAssignedBy: "deterministic", uncertainty: "Mathematical identity; every item answer is checked by code." }),
    ],
    nextQuestion: "How can you tell which of two fractions is bigger when they are not equivalent?",
  });
}

// ---------------------------------------------------------------- levers

export function leverSample(): WorksheetDocument {
  return baseDoc({
    question: "How does a simple machine change a task?",
    title: "How does a lever change a task?",
    subject: "Science · Forces and simple machines",
    format: { kind: "custom", targetStudentPages: 3, estimatedMinutes: 40, grouping: "individual" },
    audience: fluentAudience(10, 12, "some"),
    supportingQuestions: ["Why is a long crowbar easier to push than a short one?"],
    directAnswer: "A simple machine changes how a task is done, not how much work it takes. A lever lets you lift a heavy load with a smaller push, but you must push over a longer distance. The farther your push is from the pivot compared with the load, the less force you need.",
    learningPlan: {
      questionType: "how",
      scope: "Levers: effort, load, fulcrum; the trade between force and distance; ideal mechanical advantage = effort arm ÷ load arm (ignoring friction and the lever's own weight).",
      learnerAssumptions: ["Has used a seesaw, bottle opener or similar", "Knows force is a push or pull"],
      prerequisites: ["Force as a push or pull", "Division with whole numbers and simple decimals"],
      objectives: [
        { id: "obj-1", text: "Identify the effort, load and fulcrum of a lever", evidence: "Labels or names each part in a new example" },
        { id: "obj-2", text: "Explain how a lever trades a smaller force for a longer distance, and calculate its ideal mechanical advantage", evidence: "Correct calculations and an explanation that mentions distance" },
      ],
      misconceptions: [
        { id: "mis-1", text: "Machines create extra energy or ‘free’ force", correction: "A lever reduces the force needed but increases the distance moved; it does not reduce the work done", basis: "plausible-not-verified", sourceIds: [] },
      ],
      explanationSequence: ["Parts: effort, load, fulcrum", "Moving the fulcrum changes the push needed", "Smaller force, longer distance", "Ideal mechanical advantage = effort arm ÷ load arm", "Real levers lose a little to friction"],
      selectedStrategies: [
        { id: "explicit-explanation", rationale: "Parts and the force–distance trade are stated before calculation." },
        { id: "worked-example", rationale: "The figure's lever is worked through before learners calculate." },
        { id: "real-world-connection", rationale: "Paint-can and crowbar examples connect to everyday tasks." },
        { id: "misconception-address", rationale: "The ‘free energy’ idea is addressed directly." },
        { id: "formative-check", rationale: "Calculations are checked by code against the answer key." },
      ],
      assessmentMap: [
        { objectiveId: "obj-1", activityIds: ["act-parts"] },
        { objectiveId: "obj-2", activityIds: ["act-calc", "act-apply"] },
      ],
      visualPlan: [{ purpose: "Show effort arm and load arm lengths on one lever", diagramType: "lever", lossIfRemoved: "Learners could not see which distances the formula compares", diagramId: "fig-lever" }],
      supportOptions: ["Word bank for the parts", "Calculator allowed for the division"],
      extensionOptions: ["Explain why a real lever needs a little more effort than the ideal value"],
      reviewPlan: { retrievalCard: false, suggestedReviewDays: [3, 10] },
      rationale: "The sheet names the parts first, then states the force–distance trade plainly, because learners often expect machines to give ‘something for nothing’. A drawn-to-scale lever lets the formula refer to visible distances. Practice moves from naming parts, to calculating, to applying the idea to an everyday choice.",
    },
    sections: [
      sec("sec-hook", "hook", 1, { body: "A paint-can lid will not budge with your fingers. Slide a flat screwdriver under the rim, push down on the handle, and the lid pops up. What did the screwdriver change?" }),
      sec("sec-explain", "explanation", 1, {
        heading: "Effort, load and fulcrum",
        body: "A [[lever]] is a stiff bar that turns on a pivot called the [[fulcrum]]. The thing you want to move is the [[load]]. Your push or pull is the [[effort]].\n\nWhen your effort is farther from the fulcrum than the load is, you can move the load with a smaller force. There is a catch: your end of the lever travels a longer distance than the load does. The lever trades **less force** for **more distance**; it does not create energy.\n\nFor an ideal lever (no friction, weightless bar), the [[mechanical advantage]] is:\n\n**effort arm ÷ load arm**\n\nThe effort arm is the distance from the fulcrum to the effort; the load arm is the distance from the fulcrum to the load. A real lever needs a little more effort than this, because of friction and the bar's own weight.",
        claimIds: ["claim-1", "claim-2", "claim-3"],
      }),
      sec("sec-fig", "diagram", 1, { diagramId: "fig-lever", body: "In Figure 1 the effort arm is 1.5 m and the load arm is 0.5 m, so the ideal mechanical advantage is 1.5 ÷ 0.5 = 3. Pushing with a force of 100 newtons could, ideally, lift a load needing 300 newtons." }),
      sec("sec-parts", "activity", 2, { activityId: "act-parts" }),
      sec("sec-calc", "activity", 2, { activityId: "act-calc" }),
      sec("sec-apply", "activity", 2, { activityId: "act-apply" }),
      sec("sec-next", "next-question", 2, { heading: "Wonder next", body: "A ramp is also a simple machine. What does it trade?" }),
    ],
    activities: [
      act("act-parts", {
        type: "match",
        title: "Name the parts",
        instructions: "A child uses a long stick to lift a rock. The stick rests on a log. Match each thing to its part.",
        objectiveIds: ["obj-1"],
        responseMode: "match",
        items: [item("a", "the rock", 0, { options: ["load"] }), item("b", "the log", 0, { options: ["fulcrum"] }), item("c", "the child's push", 0, { options: ["effort"] })],
      }),
      act("act-calc", {
        type: "solve",
        title: "Calculate",
        instructions: "Use: ideal mechanical advantage = effort arm ÷ load arm. Show your working.",
        objectiveIds: ["obj-2"],
        items: [
          item("a", "Effort arm 2 m, load arm 0.5 m. What is the ideal mechanical advantage?", 2),
          item("b", "Effort arm 1 m, load arm 1 m. What is the ideal mechanical advantage? What does this mean for the effort needed?", 2),
          item("c", "A lever has an ideal mechanical advantage of 3. The load needs a force of 300 newtons to lift. What effort is needed, ideally?", 2),
        ],
        scored: true,
        marks: 3,
        computations: [
          { kind: "mechanical-advantage", itemId: "a", effortArm: 2, loadArm: 0.5, expected: 4, tolerance: 0.01 },
          { kind: "mechanical-advantage", itemId: "b", effortArm: 1, loadArm: 1, expected: 1, tolerance: 0.01 },
          { kind: "arithmetic", itemId: "c", expression: "300 / 3", expected: 100, tolerance: 0 },
        ],
      }),
      act("act-apply", {
        type: "apply-new-setting",
        title: "Choose the tool",
        instructions: "To open a stuck paint-can lid, would you use a teaspoon or a long flat screwdriver? Explain using the words _effort arm_ and _distance_.",
        objectiveIds: ["obj-2"],
        items: [item("a", "My choice and why:", 3)],
        supportOptions: { sentenceStarter: "I would use … because its effort arm …", wordBank: [] },
      }),
    ],
    answerKey: [
      key("act-parts", {
        answer: "Rock → load. Log → fulcrum. Child's push → effort.",
        itemAnswers: [
          { itemId: "a", answer: "load" },
          { itemId: "b", answer: "fulcrum" },
          { itemId: "c", answer: "effort" },
        ],
        reasoning: "The log is where the stick pivots; the rock is what is moved.",
      }),
      key("act-calc", {
        answer: "a) 2 ÷ 0.5 = 4. b) 1 ÷ 1 = 1: the effort equals the load (ideally); the lever changes direction only. c) 300 ÷ 3 = 100 newtons.",
        itemAnswers: [
          { itemId: "a", answer: "4" },
          { itemId: "b", answer: "1 — the effort needed equals the load" },
          { itemId: "c", answer: "100 newtons" },
        ],
        reasoning: "Ideal values ignore friction and the lever's weight, so a real lever needs slightly more effort.",
        marks: 3,
        commonErrors: ["Dividing load arm by effort arm (0.25 for a)", "Multiplying 300 × 3 in c)"],
      }),
      key("act-apply", {
        answer: "The long screwdriver: its handle gives a longer effort arm compared with the short load arm under the lid, so less force is needed, though the handle moves farther.",
        reasoning: "Credit any choice of the longer tool explained with effort arm and the trade of distance for force.",
        acceptableAlternatives: ["A spoon with a long handle, if explained the same way"],
        rubric: [
          { level: "Secure", descriptor: "Chooses the longer tool and explains with effort arm and distance." },
          { level: "Developing", descriptor: "Chooses the longer tool; explanation mentions length but not distance moved." },
        ],
      }),
    ],
    diagrams: [
      fig("fig-lever", { type: "lever", effortArm: 1.5, loadArm: 0.5, unit: "m", loadLabel: "load", effortLabel: "effort (push down)", fulcrumLabel: "fulcrum", showDistances: true }, {
        caption: "A lever with an effort arm three times as long as its load arm.",
        altText: "A lever on a triangular fulcrum: a load box on the short end, a downward effort arrow on the long end; distances 0.5 m and 1.5 m.",
        longDescription: "A horizontal bar rests on a triangular fulcrum. The fulcrum is 0.5 metres from the left end, where a box labelled load sits. At the right end, 1.5 metres from the fulcrum, an arrow points down, labelled effort (push down). Dimension lines under the bar mark the two distances: 0.5 m on the load side and 1.5 m on the effort side.",
        teachingPurpose: "Shows the two distances that the mechanical-advantage formula compares.",
        lossIfRemoved: "Learners would have to imagine which distances ‘effort arm’ and ‘load arm’ mean.",
        widthPct: 90,
      }),
    ],
    teacherNotes: {
      overview: "Learners name the parts of a lever, see why a longer effort arm reduces the force needed, and calculate ideal mechanical advantage. The force–distance trade is made explicit to head off ‘free energy’ ideas.",
      materials: ["Optional: a ruler, a pencil as a fulcrum and a few coins to model a lever"],
      safety: [],
      differentiation: { moreSupport: "Do item a) together; allow a calculator; provide a word bank (load, effort, fulcrum).", extension: "Ask learners to explain why a real lever with mechanical advantage 3 needs a bit more than 100 N, and to design a lever with mechanical advantage 5." },
      misconceptionNotes: "Stress that the effort end travels farther. A ruler-and-pencil model makes the distance difference easy to see.",
      reviewSuggestions: "After three days: draw a lever and label the effort arm and load arm.",
      curriculum: { status: "none", items: [] },
      sensitivity: { level: "none", notes: "", adultSupervision: false },
    },
    claims: [
      claim("claim-1", "A lever is a rigid bar that pivots on a fulcrum.", ["sec-explain"]),
      claim("claim-2", "A lever reduces the force needed by increasing the distance the effort moves; it does not reduce the work done.", ["sec-explain"]),
      claim("claim-3", "The ideal mechanical advantage of a lever equals effort arm divided by load arm, ignoring friction and the lever's weight.", ["sec-explain", "sec-fig"]),
    ],
    nextQuestion: "A ramp is also a simple machine. What does it trade?",
  });
}

// ---------------------------------------------------------------- historians

export function historiansSample(): WorksheetDocument {
  return baseDoc({
    question: "How do historians find out about the past?",
    title: "How do historians find out about the past?",
    subject: "Social studies · History",
    format: { kind: "custom", targetStudentPages: 3, estimatedMinutes: 40, grouping: "individual" },
    audience: fluentAudience(10, 12, "some"),
    directAnswer: "Historians find out about the past by studying evidence that survives from it — objects, documents, pictures and people's memories. They compare different sources, ask who made each one and why, and build the most careful explanation the evidence supports. When sources disagree or evidence is missing, they say so.",
    learningPlan: {
      questionType: "how-do-we-know",
      scope: "Kinds of evidence (primary and secondary sources), questions historians ask of a source, and why accounts can differ. No specific historical event is taught.",
      learnerAssumptions: ["Has met the word ‘history’ as the study of the past"],
      prerequisites: ["The past can be long ago or recent"],
      objectives: [
        { id: "obj-1", text: "Sort sources into primary and secondary for a given question", evidence: "Correct sorting with a reason" },
        { id: "obj-2", text: "Explain why two accounts of the same event can differ and how a historian would check", evidence: "Gives at least two reasons and one checking strategy" },
      ],
      misconceptions: [
        { id: "mis-1", text: "Primary sources are always true", correction: "Primary sources show what someone recorded at the time; they can be mistaken or one-sided and must be compared", basis: "plausible-not-verified", sourceIds: [] },
        { id: "mis-2", text: "History is just a list of facts that everyone agrees on", correction: "History is an interpretation built from evidence; historians can disagree", basis: "plausible-not-verified", sourceIds: [] },
      ],
      explanationSequence: ["Evidence that survives", "Primary and secondary sources", "Questions to ask of any source", "Comparing sources (corroboration)", "Saying what we do not know"],
      selectedStrategies: [
        { id: "evidence-reasoning", rationale: "The lesson is about how evidence supports claims and where it stops." },
        { id: "examples-and-non-examples", rationale: "Sorting sources builds the primary/secondary distinction." },
        { id: "text-visual-integration", rationale: "A side-by-side comparison panel organises the two kinds of source." },
        { id: "structured-discussion", rationale: "Comparing two differing accounts works well as partner talk, with an individual option." },
      ],
      assessmentMap: [
        { objectiveId: "obj-1", activityIds: ["act-sort"] },
        { objectiveId: "obj-2", activityIds: ["act-accounts"] },
      ],
      visualPlan: [{ purpose: "Compare primary and secondary sources", diagramType: "comparison", lossIfRemoved: "The two categories and their examples would be harder to compare at a glance", diagramId: "fig-sources" }],
      supportOptions: ["Sentence starters", "Partner discussion before writing"],
      extensionOptions: ["Explain how the same source can be primary for one question and secondary for another"],
      reviewPlan: { retrievalCard: false, suggestedReviewDays: [3, 14] },
      rationale: "The question asks how knowledge is made, so the sheet centres on evidence and its limits. A comparison panel organises the main distinction, sorting applies it, and the differing-accounts task asks learners to reason like historians. The accounts are invented and labelled as such, so no historical detail is fabricated.",
    },
    sections: [
      sec("sec-hook", "hook", 1, { body: "Nobody alive today watched the first people arrive in North America, or saw a castle being built. Yet books describe these things in detail. How can anyone know?" }),
      sec("sec-explain", "explanation", 1, {
        heading: "Following the evidence",
        body: "Historians work like careful detectives. They look for [[evidence]]: things that survive from the past, such as tools, buildings, letters, photographs, maps and the memories of people who were there.\n\nA [[primary source]] was made at the time by someone involved, like a diary or a photograph. A [[secondary source]] was made later by someone studying the past, like a textbook or a documentary.\n\nNo single source tells the whole story. Historians ask: _Who made this? When? Why? What might they have left out?_ Then they compare sources. When several sources agree, historians can be more confident. When they disagree, or when evidence is missing, historians say so.",
        claimIds: ["claim-1", "claim-2", "claim-3"],
      }),
      sec("sec-fig", "diagram", 1, { diagramId: "fig-sources" }),
      sec("sec-sort", "activity", 2, { activityId: "act-sort" }),
      sec("sec-accounts", "activity", 2, { activityId: "act-accounts" }),
      sec("sec-reflect", "reflection", 2, { heading: "Think back", body: "Which question about a source do you think is most useful? Why?" }),
      sec("sec-next", "next-question", 2, { heading: "Wonder next", body: "How do archaeologists work out how old an object is?" }),
    ],
    activities: [
      act("act-sort", {
        type: "sort",
        title: "Primary or secondary?",
        instructions: "Your question is: _What was school like for children in 1910?_ Tick one box for each source.",
        objectiveIds: ["obj-1"],
        responseMode: "tick",
        items: [
          item("a", "A diary written by a student in 1910", 0, { options: ["primary", "secondary"] }),
          item("b", "A textbook chapter about schools in the 1910s, written in 2015", 0, { options: ["primary", "secondary"] }),
          item("c", "A photograph of a classroom taken in 1910", 0, { options: ["primary", "secondary"] }),
          item("d", "A website article that explains old school rules", 0, { options: ["primary", "secondary"] }),
          item("e", "A school report card from 1910", 0, { options: ["primary", "secondary"] }),
        ],
      }),
      act("act-accounts", {
        type: "interpret-evidence",
        title: "Two accounts, one storm",
        instructions: "These two accounts are invented for practice. Both describe the same storm in a small town.\n\n**A letter written the next day:** “The whole street flooded. Everyone's house was ruined.”\n\n**A newspaper report a week later:** “Heavy rain caused flooding in some basements on Main Street.”",
        objectiveIds: ["obj-2"],
        items: [item("a", "Give two reasons the accounts might be different.", 3), item("b", "What other source could a historian look for to check what happened?", 2)],
        supportOptions: { sentenceStarter: "One reason is that the writer of the letter …", wordBank: [] },
      }),
    ],
    answerKey: [
      key("act-sort", {
        answer: "a) primary b) secondary c) primary d) secondary e) primary",
        itemAnswers: [
          { itemId: "a", answer: "primary" },
          { itemId: "b", answer: "secondary" },
          { itemId: "c", answer: "primary" },
          { itemId: "d", answer: "secondary" },
          { itemId: "e", answer: "primary" },
        ],
        reasoning: "Whether a source is primary depends on the question being asked. For a question about 1910 schools, items made in 1910 are primary.",
        commonErrors: ["Treating anything old-looking as primary, or anything printed as secondary"],
      }),
      key("act-accounts", {
        answer: "Sample: The letter writer may have been upset and writing about their own street, so they exaggerated. The newspaper had a week to check facts and may have spoken to more people. Either writer could have had a reason to make the storm sound bigger or smaller. A historian could look at photographs, town records of damage, insurance or repair records, or other letters.",
        reasoning: "Credit reasons about when, who, purpose and viewpoint, and any reasonable corroborating source.",
        acceptableAlternatives: ["The newspaper may have only reported Main Street", "The letter writer may have only seen their own street"],
        rubric: [
          { level: "Secure", descriptor: "Two different reasons (e.g. timing, viewpoint, purpose) and a sensible source to check." },
          { level: "Developing", descriptor: "One reason, or reasons without a checking source." },
          { level: "Not yet", descriptor: "Decides one account is simply ‘lying’ without reasons." },
        ],
      }),
    ],
    diagrams: [
      fig("fig-sources", {
        type: "comparison",
        columns: [
          { title: "Primary sources", icon: "document", points: ["Made at the time", "By people who were there", "Letters, diaries, photographs, objects, records", "Can be one-sided or mistaken"] },
          { title: "Secondary sources", icon: "book", points: ["Made later", "By people studying the past", "Textbooks, articles, documentaries", "Built from many sources; can disagree"] },
        ],
      }, {
        caption: "Two kinds of evidence historians use.",
        altText: "A two-column comparison of primary sources and secondary sources.",
        longDescription: "Left column, primary sources: made at the time, by people who were there; examples are letters, diaries, photographs, objects and records; they can be one-sided or mistaken. Right column, secondary sources: made later by people studying the past; examples are textbooks, articles and documentaries; they are built from many sources and can disagree.",
        teachingPurpose: "Organises the two kinds of source and their limits side by side.",
        lossIfRemoved: "The comparison of the two categories, including their limits, would be harder to see.",
      }),
    ],
    teacherNotes: {
      overview: "Learners meet the idea that history is built from evidence, sort sources for a specific question, and reason about why accounts differ.",
      materials: [],
      safety: [],
      differentiation: { moreSupport: "Discuss the storm accounts in pairs before writing; use the sentence starter.", extension: "Find a source that would be primary for one question and secondary for another, and explain." },
      misconceptionNotes: "Emphasise that primary does not mean true. Both kinds of source need questioning.",
      reviewSuggestions: "Two weeks later, give learners a new source and ask the four questions: who, when, why, what is missing?",
      curriculum: { status: "none", items: [] },
      sensitivity: { level: "care", notes: "If extended to real events, choose sources that represent the perspectives of the people involved, including Indigenous perspectives where relevant.", adultSupervision: false },
    },
    claims: [
      claim("claim-1", "Historians use surviving evidence such as objects, documents, images and oral accounts.", ["sec-explain"]),
      claim("claim-2", "A primary source was created at the time under study; a secondary source was created later by someone studying it.", ["sec-explain"]),
      claim("claim-3", "Historians compare sources and treat agreement between independent sources as stronger evidence.", ["sec-explain"]),
    ],
    nextQuestion: "How do archaeologists work out how old an object is?",
  });
}

// ---------------------------------------------------------------- inflation

export function inflationSample(): WorksheetDocument {
  return baseDoc({
    question: "What is inflation?",
    title: "What is inflation?",
    subject: "Social studies · Economics",
    audience: { ...fluentAudience(11, 13, "new"), readingDemand: "fluent" },
    directAnswer: "Inflation is a general rise in prices across an economy over time. When there is inflation, each dollar buys a little less than it did before. One item getting more expensive is not inflation on its own; inflation means prices are rising across many goods and services.",
    learningPlan: {
      questionType: "what",
      scope: "Definition of inflation, how it is measured with a ‘basket’ of goods (the Consumer Price Index), calculating a percentage price change, and distinguishing inflation from a single price rise. Causes and policy are introduced only briefly.",
      learnerAssumptions: ["Has bought things with money", "Can work out simple percentages with support"],
      prerequisites: ["Percent as ‘out of 100’"],
      objectives: [
        { id: "obj-1", text: "Define inflation and tell it apart from a single price rise", evidence: "Correctly sorts examples and non-examples" },
        { id: "obj-2", text: "Calculate a percentage price change for a basket of goods", evidence: "Correct calculation with working" },
      ],
      misconceptions: [
        { id: "mis-1", text: "Any price increase is inflation", correction: "Inflation is a general rise across many prices, not one item", basis: "plausible-not-verified", sourceIds: [] },
        { id: "mis-2", text: "Inflation means prices go up once and then stop", correction: "Inflation is measured as a rate over time; prices usually keep rising slowly", basis: "plausible-not-verified", sourceIds: [] },
      ],
      explanationSequence: ["Prices change over time", "Inflation = general rise in prices", "Measured with a basket (CPI)", "Percentage change", "Example vs non-example"],
      selectedStrategies: [
        { id: "explicit-explanation", rationale: "The concept is new, so the definition comes first." },
        { id: "examples-and-non-examples", rationale: "Separates inflation from single price rises." },
        { id: "worked-example", rationale: "One percentage change is worked before learners try one." },
        { id: "real-world-connection", rationale: "A grocery basket makes the measure concrete." },
      ],
      assessmentMap: [
        { objectiveId: "obj-1", activityIds: ["act-sort"] },
        { objectiveId: "obj-2", activityIds: ["act-calc"] },
      ],
      visualPlan: [{ purpose: "Show a basket's price rising over three years", diagramType: "bar-chart", lossIfRemoved: "The data for the calculation and the gradual rise would be hidden in text", diagramId: "fig-basket" }],
      supportOptions: ["Percentage steps written out", "Calculator allowed"],
      extensionOptions: ["Explain why the Bank of Canada aims for low, steady inflation rather than zero"],
      reviewPlan: { retrievalCard: false, suggestedReviewDays: [3, 10] },
      rationale: "Learners new to economics need a precise definition before discussion. A made-up basket keeps the numbers simple and honest; the chart supplies data for a worked calculation. The sorting task targets the commonest confusion: treating any price rise as inflation.",
    },
    sections: [
      sec("sec-hook", "hook", 1, { body: "An adult tells you that a chocolate bar cost much less when they were your age. Were chocolate bars special, or did nearly everything cost less back then?" }),
      sec("sec-explain", "explanation", 1, {
        heading: "Prices, over time",
        body: "[[Inflation]] is a general rise in prices across an economy over time. When prices rise in general, each dollar buys a little less than before.\n\nTo measure inflation, Statistics Canada tracks the price of a large “basket” of goods and services that households buy, such as food, rent, clothing and transport. This measure is called the [[Consumer Price Index]] (CPI). If the basket costs more this year than last year, the percentage increase is the inflation rate.\n\nOne thing becoming more expensive — strawberries in winter, say — is not inflation by itself. Inflation is about prices in general. The Bank of Canada aims to keep inflation at about 2% a year.",
        claimIds: ["claim-1", "claim-2", "claim-3"],
      }),
      sec("sec-fig", "diagram", 1, { diagramId: "fig-basket", body: "The basket in Figure 1 is **made up** for practice. From Year 1 to Year 2 its price rose from $50 to $52. The change is 52 − 50 = $2, and 2 ÷ 50 × 100 = 4%. So prices for this basket rose by 4%." }),
      sec("sec-calc", "activity", 2, { activityId: "act-calc" }),
      sec("sec-sort", "activity", 2, { activityId: "act-sort" }),
      sec("sec-note", "note", 2, { body: "_This sheet explains a general idea. It is not advice about anyone's own money._" }),
      sec("sec-next", "next-question", 2, { heading: "Wonder next", body: "Why might a little inflation be easier for a country to manage than prices that fall?" }),
    ],
    activities: [
      act("act-calc", {
        type: "read-graph",
        title: "Read the chart, then calculate",
        instructions: "Use Figure 1.",
        objectiveIds: ["obj-2"],
        items: [item("a", "What did the basket cost in Year 3?", 1), item("b", "By what percentage did the basket's price rise from Year 1 to Year 3? Show your working.", 3)],
        scored: true,
        marks: 3,
        computations: [{ kind: "percent-change", itemId: "b", from: 50, to: 54, expected: 8, tolerance: 0.05 }],
        supportOptions: { sentenceStarter: "Change = … − … = … ; … ÷ … × 100 = …%", wordBank: [] },
      }),
      act("act-sort", {
        type: "sort",
        title: "Inflation or not?",
        instructions: "Tick one box for each statement.",
        objectiveIds: ["obj-1"],
        responseMode: "tick",
        items: [
          item("a", "Strawberries cost more in January than in July.", 0, { options: ["inflation", "not inflation on its own"] }),
          item("b", "Most prices in the CPI basket are higher than they were a year ago.", 0, { options: ["inflation", "not inflation on its own"] }),
          item("c", "A new phone model costs more than last year's model.", 0, { options: ["inflation", "not inflation on its own"] }),
          item("d", "Food, rent and bus fares have all risen over the past year.", 0, { options: ["inflation", "not inflation on its own"] }),
        ],
      }),
    ],
    answerKey: [
      key("act-calc", {
        answer: "a) $54. b) Change = 54 − 50 = $4; 4 ÷ 50 × 100 = 8%.",
        itemAnswers: [
          { itemId: "a", answer: "$54" },
          { itemId: "b", answer: "8%" },
        ],
        reasoning: "Percentage change compares the change with the starting price.",
        marks: 3,
        commonErrors: ["Dividing by the new price (4 ÷ 54 ≈ 7.4%)", "Adding the yearly percentages (4% + 3.8%) — close here, but not the same method"],
      }),
      key("act-sort", {
        answer: "a) not inflation on its own b) inflation c) not inflation on its own d) inflation",
        itemAnswers: [
          { itemId: "a", answer: "not inflation on its own — a seasonal change in one item" },
          { itemId: "b", answer: "inflation — a general rise across the basket" },
          { itemId: "c", answer: "not inflation on its own — a different, newer product" },
          { itemId: "d", answer: "inflation — many different prices rising" },
        ],
        reasoning: "Inflation describes prices in general rising over time, not one product.",
      }),
    ],
    diagrams: [
      fig("fig-basket", { type: "bar-chart", title: "A made-up basket of groceries", yLabel: "Price", unit: "$", bars: [{ label: "Year 1", value: 50 }, { label: "Year 2", value: 52 }, { label: "Year 3", value: 54 }], yMax: 60 }, {
        caption: "The price of the same made-up basket over three years. These are practice numbers, not real data.",
        altText: "Bar chart: a made-up grocery basket costs $50 in Year 1, $52 in Year 2 and $54 in Year 3.",
        longDescription: "A bar chart titled ‘A made-up basket of groceries’. The vertical axis shows price in dollars from 0 to 60. Three bars show Year 1 at $50, Year 2 at $52 and Year 3 at $54. The numbers are invented for practice.",
        teachingPurpose: "Provides data for a percentage-change calculation and shows a gradual rise.",
        lossIfRemoved: "The calculation would have no data, and the gradual rise would be harder to see.",
        widthPct: 80,
      }),
    ],
    teacherNotes: {
      overview: "Learners define inflation, see how it is measured with a basket of prices, calculate a percentage change, and separate inflation from single price rises.",
      materials: ["Calculator (optional)"],
      safety: [],
      differentiation: { moreSupport: "Work through the Year 1 → Year 2 example together; allow a calculator.", extension: "Research Canada's most recent annual CPI change from Statistics Canada and compare it with the 2% target." },
      misconceptionNotes: "The y-axis starts at 0 so the bar heights are honest; point this out, since many charts in the news do not.",
      reviewSuggestions: "Later, ask learners to explain the difference between ‘one price went up’ and ‘inflation’.",
      curriculum: { status: "none", items: [] },
      sensitivity: { level: "care", notes: "Money can be a sensitive topic. Keep examples general; this is educational content, not financial advice.", adultSupervision: false },
    },
    claims: [
      claim("claim-1", "Inflation is a general rise in prices across an economy over time, reducing what each unit of money buys.", ["sec-explain"]),
      claim("claim-2", "Statistics Canada measures consumer price changes using the Consumer Price Index, based on a basket of goods and services.", ["sec-explain"]),
      claim("claim-3", "The Bank of Canada aims to keep inflation at about 2% a year (the midpoint of a 1–3% target range).", ["sec-explain"]),
    ],
    nextQuestion: "Why might a little inflation be easier for a country to manage than prices that fall?",
  });
}
