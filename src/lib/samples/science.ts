import type { WorksheetDocument } from "../schema/document";
import { act, baseDoc, claim, fig, item, key, sec, SAMPLE_BRAND } from "./helpers";
import { defaultLayout } from "../defaults";

export function shadowsSample(): WorksheetDocument {
  return baseDoc({
    question: "Why do shadows change during the day?",
    title: "Why do shadows change during the day?",
    subject: "Science · Earth and space",
    format: { kind: "custom", targetStudentPages: 3, estimatedMinutes: 40, grouping: "individual" },
    supportingQuestions: ["Why is my shadow long in the morning?"],
    directAnswer:
      "Shadows change because the Sun's position in our sky changes as Earth spins. When the Sun is low, in the early morning and late afternoon, shadows are long. When the Sun is at its highest, around the middle of the day, shadows are shortest. A shadow always points away from the Sun.",
    learningPlan: {
      questionType: "why",
      scope: "How the Sun's apparent height changes the length and direction of a shadow over one day. Seasonal changes are left for the next question.",
      learnerAssumptions: ["Has seen their own shadow outdoors", "Knows that the Sun rises in the morning and sets in the evening"],
      prerequisites: ["Light comes from a source such as the Sun", "Left/right and long/short comparisons"],
      objectives: [
        { id: "obj-1", text: "Explain that a shadow forms where an object blocks light", evidence: "Uses the idea of blocked light in an explanation" },
        { id: "obj-2", text: "Describe how the Sun's height changes a shadow's length and direction", evidence: "Matches low and high Sun to long and short shadows, and says which way a shadow points" },
      ],
      misconceptions: [
        { id: "mis-1", text: "The shadow moves because the object or the person moves", correction: "The object stays still; the Sun's position in the sky changes because Earth rotates", basis: "plausible-not-verified", sourceIds: [] },
        { id: "mis-2", text: "The Sun itself travels around Earth each day", correction: "Earth spins; the Sun only appears to move across our sky", basis: "plausible-not-verified", sourceIds: [] },
      ],
      explanationSequence: ["A shadow is where light is blocked", "Light travels in straight lines", "The Sun appears to move because Earth rotates", "Low Sun → long shadow; high Sun → short shadow", "Shadows point away from the Sun"],
      selectedStrategies: [
        { id: "prediction-and-revisit", rationale: "Learners predict when shadows are shortest, then check the prediction against the diagram." },
        { id: "explicit-explanation", rationale: "The mechanism is stated plainly before any independent work." },
        { id: "text-visual-integration", rationale: "The three-panel figure shows the one variable (Sun height) that the text explains." },
        { id: "experiential-observation", rationale: "A safe shadow-tracking task connects the idea to first-hand evidence, with a no-materials alternative." },
        { id: "retrieval-practice", rationale: "A recall card on page 2 asks learners to explain from memory." },
      ],
      assessmentMap: [
        { objectiveId: "obj-1", activityIds: ["act-read", "act-recall"] },
        { objectiveId: "obj-2", activityIds: ["act-read", "act-match", "act-track"] },
      ],
      visualPlan: [{ purpose: "Show how Sun height changes shadow length", diagramType: "light-shadow", lossIfRemoved: "Learners would have to imagine the angle–length relationship instead of seeing it at one fair scale", diagramId: "fig-shadows" }],
      supportOptions: ["Word bank for the matching task", "Oral explanation instead of writing"],
      extensionOptions: ["Predict afternoon shadows and explain which way they point"],
      reviewPlan: { retrievalCard: true, suggestedReviewDays: [2, 7] },
      rationale:
        "Most learners at this age have noticed shadows but have not linked their length to the Sun's height. The sheet therefore starts from a familiar observation and a prediction, gives the explanation directly, and uses a single comparison figure drawn at one scale so the pattern is visible. Practice moves from reading the figure to matching, then to a real observation, and ends with recall on the second page so the explanation cannot simply be copied.",
    },
    sections: [
      sec("sec-hook", "hook", 1, { body: "Stand outside on a sunny morning and your shadow may stretch across the grass, longer than you are tall. Come back near lunchtime and it has shrunk to a small patch by your feet. You did not change size. So what did?", claimIds: [] }),
      sec("sec-predict", "prediction", 1, { heading: "Predict", body: "At about what time of day do you think your shadow is shortest? Why do you think so?" }),
      sec("sec-explain", "explanation", 1, {
        heading: "Light, blocked",
        body:
          "A [[shadow]] forms where something blocks light. Light travels in straight lines, so it cannot bend around you to fill the space behind you. That space is darker: it is your shadow.\n\nDuring the day the Sun seems to travel across the sky. It is really Earth that is moving. Earth [[rotates]] (spins) about once every 24 hours, so from where we stand the Sun appears to rise in the east, climb higher, and then sink toward the west.\n\nWhen the Sun is low, its light arrives at a shallow slant and the shadow stretches out long. When the Sun is high, the light comes from more nearly overhead and the shadow is short. Your shadow is always on the side of you that faces away from the Sun.",
        claimIds: ["claim-1", "claim-2", "claim-3", "claim-4"],
      }),
      sec("sec-fig", "diagram", 1, { diagramId: "fig-shadows", body: "The same stick is drawn in each panel at the same height. Only the Sun's height changes." }),
      sec("sec-read", "activity", 1, { activityId: "act-read" }),
      sec("sec-match", "activity", 1, { activityId: "act-match" }),
      sec("sec-safety", "safety", 2, { body: "**Never look straight at the Sun**, even with sunglasses. Look only at the ground and the shadow." }),
      sec("sec-track", "activity", 2, { activityId: "act-track" }),
      sec("sec-recall", "activity", 2, { activityId: "act-recall" }),
      sec("sec-reflect", "reflection", 2, { heading: "Think back", body: "Look at your prediction at the top of page 1. Which clue changed your thinking, or which clue showed you were right?" }),
      sec("sec-next", "next-question", 2, { heading: "Wonder next", body: "Why is your midday shadow longer in winter than in summer?", claimIds: ["claim-5"] }),
    ],
    activities: [
      act("act-read", {
        type: "interpret-evidence",
        title: "Read the shadows",
        instructions: "Use Figure 1 to answer.",
        objectiveIds: ["obj-1", "obj-2"],
        items: [item("a", "In which panel is the Sun lowest? How can you tell from the shadow?", 2), item("b", "Every shadow in Figure 1 points to the right. Which side of the stick is the Sun on?", 1)],
        supportOptions: { sentenceStarter: "The Sun is lowest in … because the shadow …", wordBank: [], oralAlternative: "Point to the panel and explain your answer to a partner or adult." },
      }),
      act("act-match", {
        type: "match",
        title: "Match the sky to the shadow",
        instructions: "Write the letter of the matching shadow next to each sky.",
        objectiveIds: ["obj-2"],
        responseMode: "match",
        items: [
          item("a", "Sun low in the sky", 0, { options: ["a long shadow"] }),
          item("b", "Sun high in the sky", 0, { options: ["a short shadow"] }),
          item("c", "Sun hidden behind thick cloud", 0, { options: ["a faint shadow, or none"] }),
        ],
        supportOptions: { wordBank: [] },
      }),
      act("act-track", {
        type: "observe",
        title: "Track a shadow",
        instructions:
          "On a sunny day, stand a pencil upright in a lump of modelling clay on flat ground. Measure its shadow at three times, at least an hour apart.\n\nNo sunshine or materials? Use Figure 1: measure each shadow with a ruler instead.",
        objectiveIds: ["obj-2"],
        items: [item("a", "First time: __________   Shadow length: ________ cm", 0), item("b", "Second time: __________   Shadow length: ________ cm", 0), item("c", "Third time: __________   Shadow length: ________ cm", 0), item("d", "What pattern did you find? Use the word _Sun_ in your answer.", 2)],
        supportOptions: { wordBank: [], drawingAlternative: "Draw the pencil and its shadow at each time instead of measuring." },
      }),
      act("act-recall", {
        type: "recall",
        title: "From memory",
        instructions: "",
        objectiveIds: ["obj-1", "obj-2"],
        coverInstruction: true,
        items: [item("a", "In two sentences, explain why a shadow is long in the early morning.", 3)],
        supportOptions: { sentenceStarter: "In the early morning the Sun is …", wordBank: [] },
      }),
    ],
    answerKey: [
      key("act-read", {
        answer: "a) The first panel (early morning). Its shadow is the longest. b) On the left side, opposite the shadow.",
        itemAnswers: [
          { itemId: "a", answer: "Early morning — the longest shadow shows the lowest Sun." },
          { itemId: "b", answer: "The left, because a shadow points away from the Sun." },
        ],
        reasoning: "A lower Sun sends light in at a shallower slant, so the blocked area behind the stick is longer. Shadows always fall on the side away from the light.",
        acceptableAlternatives: ["“The morning one” for a)", "“Opposite the shadow” for b)"],
        commonErrors: ["Choosing the shortest shadow as the lowest Sun"],
      }),
      key("act-match", {
        answer: "Sun low → a long shadow; Sun high → a short shadow; Sun behind thick cloud → a faint shadow, or none.",
        itemAnswers: [
          { itemId: "a", answer: "a long shadow" },
          { itemId: "b", answer: "a short shadow" },
          { itemId: "c", answer: "a faint shadow, or none" },
        ],
        reasoning: "Thick cloud scatters sunlight so it comes from many directions; no sharp area is fully blocked.",
      }),
      key("act-track", {
        answer: "Lengths depend on the date, the place and the times chosen. Before midday, each later measurement should be shorter; after midday, each later one should be longer.",
        reasoning: "The shadow is shortest when the Sun is highest, near the middle of the day.",
        rubric: [
          { level: "Secure", descriptor: "States the pattern and links it to the Sun getting higher (or lower)." },
          { level: "Developing", descriptor: "States the pattern without linking it to the Sun's position." },
          { level: "Not yet", descriptor: "Records lengths but describes no pattern." },
        ],
        commonErrors: ["Measuring from the wrong end of the shadow", "Moving the pencil between measurements"],
      }),
      key("act-recall", {
        answer: "In the early morning the Sun is low in the sky. Its light comes in at a shallow slant, so the area the object blocks stretches out long behind it.",
        reasoning: "Look for two ideas: the Sun is low, and blocked light makes the shadow.",
        acceptableAlternatives: ["Any wording that links a low Sun to a long shadow and mentions blocked light"],
        rubric: [
          { level: "Secure", descriptor: "Both ideas: low Sun and blocked light." },
          { level: "Developing", descriptor: "One of the two ideas." },
        ],
      }),
    ],
    diagrams: [
      fig(
        "fig-shadows",
        {
          type: "light-shadow",
          objectLabel: "Stick",
          showLengthLabels: true,
          times: [
            { label: "Early morning", sunElevationDeg: 15, sunSide: "left" },
            { label: "Mid-morning", sunElevationDeg: 32, sunSide: "left" },
            { label: "Late morning", sunElevationDeg: 55, sunSide: "left" },
          ],
        },
        {
          caption: "The same stick on one morning. As the Sun climbs, the shadow gets shorter.",
          altText: "Three panels: as the Sun rises higher, the same stick's shadow becomes shorter.",
          longDescription:
            "Three side-by-side panels show the same upright stick on flat ground. In the first panel, labelled early morning, the Sun is low on the left and the stick's shadow stretches far to the right — almost four times the stick's height. In the second, mid-morning, the Sun is higher and the shadow is about one and a half times the stick's height. In the third, late morning, the Sun is higher still and the shadow is shorter than the stick. A dashed line from the Sun past the top of the stick shows where the shadow ends. This is a simplified side view: it shows the Sun's height but not that, in Canada, the Sun is in the southern part of the sky at midday.",
          teachingPurpose: "Shows that only the Sun's height changes and that shadow length follows from it.",
          lossIfRemoved: "Learners would have to imagine the link between Sun height and shadow length; the fair, same-scale comparison would be lost.",
        },
      ),
    ],
    teacherNotes: {
      overview:
        "Learners connect a familiar observation — shadows that grow and shrink — to the Sun's changing height in the sky. Page 1 explains and checks the idea; page 2 adds a safe observation and a recall card.",
      materials: ["Pencil", "Modelling clay", "Ruler", "Chalk or paper (optional)"],
      safety: ["Remind learners never to look directly at the Sun.", "Choose a safe, flat outdoor spot away from traffic."],
      differentiation: { moreSupport: "Do the matching task first, use the word bank, and allow oral answers.", extension: "Ask learners to predict and draw the afternoon shadows, and explain which way they point." },
      misconceptionNotes: "If a learner says the Sun moves around Earth, accept the everyday wording (“the Sun moves across the sky”) and add: “It looks that way because Earth is spinning.”",
      reviewSuggestions: "Two days later, ask: “Draw a stick and its shadow when the Sun is low.” A week later, ask which way a shadow points.",
      curriculum: { status: "none", items: [] },
      sensitivity: { level: "none", notes: "", adultSupervision: false },
    },
    claims: [
      claim("claim-1", "A shadow forms where an object blocks light.", ["sec-explain"]),
      claim("claim-2", "Light travels in straight lines.", ["sec-explain"]),
      claim("claim-3", "Earth rotates about once every 24 hours, which makes the Sun appear to move across the sky.", ["sec-explain"]),
      claim("claim-4", "The lower the Sun is in the sky, the longer the shadow it casts.", ["sec-explain"], { evidenceStatus: "supported", statusAssignedBy: "deterministic", uncertainty: "Geometry: shadow length = height ÷ tan(Sun elevation); the figure is computed from this." }),
      claim("claim-5", "In Canada, the midday Sun is lower in winter than in summer, so midday shadows are longer in winter.", ["sec-next"]),
    ],
    nextQuestion: "Why is your midday shadow longer in winter than in summer?",
  });
}

export function seedSample(): WorksheetDocument {
  return baseDoc({
    question: "How does a seed begin to grow?",
    title: "How does a seed begin to grow?",
    subject: "Science · Plants",
    audience: {
      ageMin: 6,
      ageMax: 8,
      readingDemand: "early",
      priorKnowledge: "new",
      intendedUse: "adult-supported",
      language: "en",
      regionalConventions: { spelling: "en-CA", units: "metric" },
      supportPreferences: { vocabularySupport: true, sentenceStarters: true, oralAlternatives: true, drawingAlternatives: true },
    },
    layout: { ...defaultLayout(), brand: SAMPLE_BRAND, fontScale: "large", writingSpace: "generous", visualFamily: "early-years" },
    directAnswer: "A seed holds a tiny baby plant and a store of food. When it gets water, air and the right warmth, it soaks up water and swells. Its coat splits, a root grows down first, and then a shoot grows up.",
    learningPlan: {
      questionType: "how",
      scope: "The first stages of germination for a typical bean seed: taking in water, the root, then the shoot.",
      learnerAssumptions: ["May have planted seeds before", "Is still building reading fluency; an adult may read aloud"],
      prerequisites: ["Plants are living things"],
      objectives: [
        { id: "obj-1", text: "Put the first stages of a seed's growth in order", evidence: "Orders and labels root and shoot correctly" },
        { id: "obj-2", text: "Name what a seed needs to begin growing", evidence: "Identifies water, air and warmth, and recognises that soil is not needed to start" },
      ],
      misconceptions: [{ id: "mis-1", text: "Seeds need soil to start growing", correction: "Many seeds begin growing on damp paper; soil helps the young plant later", basis: "plausible-not-verified", sourceIds: [] }],
      explanationSequence: ["A seed has a tiny plant and stored food inside", "It needs water, air and warmth", "It swells and the coat splits", "The root grows down first", "The shoot grows up"],
      selectedStrategies: [
        { id: "explicit-explanation", rationale: "New learners are told the sequence directly before they try it." },
        { id: "cognitive-load-chunking", rationale: "One idea per step, with a picture beside each step." },
        { id: "text-visual-integration", rationale: "The sequence figure carries the order; the text explains each picture." },
        { id: "experiential-observation", rationale: "A bean-in-a-jar task lets learners see the root appear first." },
        { id: "misconception-address", rationale: "The ‘needs soil’ idea is checked in the sorting task." },
      ],
      assessmentMap: [
        { objectiveId: "obj-1", activityIds: ["act-label", "act-order"] },
        { objectiveId: "obj-2", activityIds: ["act-needs"] },
      ],
      visualPlan: [
        { purpose: "Show the order of the first stages", diagramType: "sequence", lossIfRemoved: "The order of events, which is the main idea", diagramId: "fig-stages" },
        { purpose: "Practise naming the parts", diagramType: "labelled-scene", lossIfRemoved: "The labelling task itself", diagramId: "fig-label" },
      ],
      supportOptions: ["Adult reads aloud", "Word bank for labels", "Point and say instead of writing"],
      extensionOptions: ["Keep a five-day seed diary"],
      reviewPlan: { retrievalCard: false, suggestedReviewDays: [3, 10] },
      rationale:
        "For young, new readers the sheet uses large type, short sentences and one idea per step. The explanation and a picture sequence come first; practice then asks learners to label, order and sort, which lowers the writing load while still checking the objectives.",
    },
    sections: [
      sec("sec-hook", "hook", 1, { body: "A dry bean can sit in a jar for months and do nothing. Put it on a damp paper towel, and in a few days something pokes out. What is happening inside?" }),
      sec("sec-explain", "explanation", 1, {
        heading: "What happens first",
        body: "Inside every seed is a tiny plant and a store of food.\n\nThe seed waits until it has **water**, **air** and the right **warmth**. Then it soaks up water and swells. The seed coat splits open.\n\nA [[root]] grows out first. It grows down. Next, a [[shoot]] grows up.",
        claimIds: ["claim-1", "claim-2", "claim-3"],
      }),
      sec("sec-fig", "diagram", 1, { diagramId: "fig-stages" }),
      sec("sec-label", "activity", 1, { activityId: "act-label" }),
      sec("sec-order", "activity", 2, { activityId: "act-order" }),
      sec("sec-needs", "activity", 2, { activityId: "act-needs" }),
      sec("sec-safety", "safety", 2, { body: "Some seeds can make you sick if you eat them. **Do not eat the seeds.** Wash your hands after touching them." }),
      sec("sec-try", "investigation", 2, {
        heading: "Try it",
        body: "Fold a paper towel and wet it. Put it in a clear jar. Push a dry bean between the towel and the glass. Keep the towel damp. Look every day for five days.\n\nNo bean? Look at Figure 1 again and say what you would see each day.",
      }),
      sec("sec-next", "next-question", 2, { heading: "Wonder next", body: "Where does a young plant get its food before its leaves open?" }),
    ],
    activities: [
      act("act-label", {
        type: "label",
        title: "Label the sprouting seed",
        instructions: "Write a word from the word bank in each empty box.",
        objectiveIds: ["obj-1"],
        responseMode: "label",
        diagramId: "fig-label",
        items: [],
        supportOptions: { wordBank: ["seed coat", "root", "shoot"], oralAlternative: "Point to each part and say its name to an adult." },
      }),
      act("act-order", {
        type: "sequence",
        title: "What comes next?",
        instructions: "Number the boxes 1, 2, 3 and 4 to show the order.",
        objectiveIds: ["obj-1"],
        responseMode: "order",
        items: [item("a", "A shoot grows up.", 0), item("b", "The seed soaks up water and swells.", 0), item("c", "A dry seed waits.", 0), item("d", "A root grows down.", 0)],
        supportOptions: { wordBank: [], drawingAlternative: "Draw the four steps in order." },
      }),
      act("act-needs", {
        type: "sort",
        title: "What does a seed need to start?",
        instructions: "Tick one box for each thing.",
        objectiveIds: ["obj-2"],
        responseMode: "tick",
        items: [
          item("a", "water", 0, { options: ["needed", "not needed"] }),
          item("b", "air", 0, { options: ["needed", "not needed"] }),
          item("c", "warmth", 0, { options: ["needed", "not needed"] }),
          item("d", "soil", 0, { options: ["needed", "not needed"] }),
        ],
        supportOptions: { wordBank: [] },
      }),
    ],
    answerKey: [
      key("act-label", {
        answer: "Seed coat — the outer skin of the seed. Root — the part growing down. Shoot — the part growing up with a leaf.",
        reasoning: "The root comes out first and grows down; the shoot grows up toward the light.",
      }),
      key("act-order", {
        answer: "1 A dry seed waits. 2 The seed soaks up water and swells. 3 A root grows down. 4 A shoot grows up.",
        itemAnswers: [
          { itemId: "a", answer: "4" },
          { itemId: "b", answer: "2" },
          { itemId: "c", answer: "1" },
          { itemId: "d", answer: "3" },
        ],
        reasoning: "The root appears before the shoot in beans and many other seeds.",
        commonErrors: ["Putting the shoot before the root"],
      }),
      key("act-needs", {
        answer: "Water: needed. Air: needed. Warmth: needed (the right temperature). Soil: not needed to start.",
        itemAnswers: [
          { itemId: "a", answer: "needed" },
          { itemId: "b", answer: "needed" },
          { itemId: "c", answer: "needed" },
          { itemId: "d", answer: "not needed" },
        ],
        reasoning: "Seeds can begin growing on damp paper. Soil gives the young plant support and water later. Light is not on the list because most seeds do not need it to start, though some kinds do.",
        commonErrors: ["Ticking soil as needed — a good moment to point at the paper-towel jar"],
      }),
    ],
    diagrams: [
      fig(
        "fig-stages",
        {
          type: "sequence",
          cyclic: false,
          steps: [
            { label: "Dry seed", detail: "A tiny plant and food inside", icon: "seed" },
            { label: "Takes in water", detail: "It swells; the coat splits", icon: "water-drop" },
            { label: "Root first", detail: "The root grows down", icon: "sprout" },
            { label: "Then a shoot", detail: "The shoot grows up", icon: "seedling" },
          ],
        },
        {
          caption: "The first four stages of a bean seed starting to grow.",
          altText: "Four pictures in a row show a dry seed, the seed taking in water, a root coming out, and a shoot growing up.",
          longDescription: "A row of four numbered pictures joined by arrows. 1: a dry seed — inside is a tiny plant and food. 2: a water drop — the seed takes in water, swells and its coat splits. 3: a seed with a root coming out — the root grows down. 4: a small seedling with two leaves — the shoot grows up.",
          teachingPurpose: "Shows the order of the first stages, one idea per picture.",
          lossIfRemoved: "The order of events would be text only, which is hard for early readers to hold in mind.",
        },
      ),
      fig(
        "fig-label",
        {
          type: "labelled-scene",
          width: 600,
          height: 300,
          primitives: [
            { shape: "polygon", points: [[160, 168], [164, 140], [182, 116], [212, 104], [240, 110], [262, 122], [286, 112], [314, 102], [344, 110], [362, 136], [362, 170], [345, 198], [310, 214], [260, 220], [210, 214], [178, 198]], fill: "paper", smooth: true },
            { shape: "polyline", points: [[252, 120], [262, 128], [272, 120]], smooth: true },
            { shape: "polyline", points: [[240, 216], [235, 236], [242, 256], [234, 276], [238, 294]], smooth: true },
            { shape: "polyline", points: [[237, 246], [221, 259]], smooth: true },
            { shape: "polyline", points: [[239, 268], [255, 281]], smooth: true },
            { shape: "polyline", points: [[264, 122], [272, 96], [288, 72], [300, 52], [309, 40]], smooth: true },
            { shape: "polygon", points: [[309, 40], [316, 26], [332, 17], [350, 18], [343, 32], [327, 41]], fill: "none", smooth: true },
            { shape: "polygon", points: [[305, 50], [294, 37], [278, 32], [283, 45], [297, 52]], fill: "none", smooth: true },
          ],
          callouts: [
            { id: "callout-coat", text: "seed coat", anchor: { x: 362, y: 155 }, at: { x: 440, y: 155 }, blank: true },
            { id: "callout-root", text: "root", anchor: { x: 237, y: 282 }, at: { x: 130, y: 282 }, blank: true },
            { id: "callout-shoot", text: "shoot", anchor: { x: 291, y: 68 }, at: { x: 440, y: 68 }, blank: true },
          ],
          legend: [],
        },
        {
          caption: "A bean seed a few days after it was put on damp paper.",
          altText: "A bean seed with a root growing down and a shoot growing up; three label lines point to the coat, the root and the shoot.",
          longDescription: "An oval bean seed sits in the middle. From its bottom edge a wavy root grows down, with two small side roots. From its top edge a thin shoot grows up and ends in two small leaves. Three lines point to the outside of the seed (the seed coat), to the root and to the shoot, each ending at an empty box for the learner's label.",
          teachingPurpose: "Gives learners a picture to label with the new words.",
          lossIfRemoved: "The labelling activity could not be done.",
        },
      ),
    ],
    teacherNotes: {
      overview: "A gentle introduction to germination for early readers. Read page 1 aloud if needed; page 2 has sorting, ordering and a bean-in-a-jar observation.",
      materials: ["Dried beans", "Clear jar", "Paper towels", "Water"],
      safety: ["Some dried beans are harmful if eaten raw. Supervise and keep seeds away from mouths.", "Hand-washing after handling seeds."],
      differentiation: { moreSupport: "Read the sheet aloud; let learners point and say labels; use the word bank.", extension: "Keep a five-day diary with a drawing each day and measure the root with a ruler." },
      misconceptionNotes: "Many children expect soil to be necessary. The jar shows otherwise; soil matters later for support and water.",
      reviewSuggestions: "After three days, ask learners to tell you the order from memory while they look at their jar.",
      curriculum: { status: "none", items: [] },
      sensitivity: { level: "care", notes: "Food-related practical: some raw beans are unsafe to eat.", adultSupervision: true },
    },
    claims: [
      claim("claim-1", "A seed contains a tiny plant (embryo) and a store of food.", ["sec-explain"]),
      claim("claim-2", "Seeds need water, oxygen and a suitable temperature to begin germinating.", ["sec-explain"]),
      claim("claim-3", "In beans and many other plants the root emerges before the shoot.", ["sec-explain"]),
      claim("claim-4", "Many seeds can germinate without soil, for example on damp paper.", ["sec-needs"]),
      claim("claim-5", "Most seeds do not need light to germinate, though some kinds do.", ["sec-needs"]),
      claim("claim-6", "Some dried beans are harmful to eat raw.", ["sec-safety"]),
    ],
    nextQuestion: "Where does a young plant get its food before its leaves open?",
  });
}
