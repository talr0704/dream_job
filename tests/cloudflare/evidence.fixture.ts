import { verifiedProfileSchema } from "../../shared/contracts";
import { profile } from "./fixtures";
export const evidenceProfile = verifiedProfileSchema.parse({
  ...profile,
  headline: "Full Stack Web Developer | React",
  summary: "Develops web applications and learning experiences.",
  experience: [
    {
      id: "career",
      title: "Digital Solutions Developer & Learning Designer",
      employer: "Example Studio",
      dates: "2022–present",
      provenance: null,
      achievements: [
        {
          id: "pm1",
          text: "Gathered customer needs and translated stakeholder needs into feature requirements.",
          provenance: null,
        },
        {
          id: "pm2",
          text: "Prioritized feature requirements using user feedback and shipped iterative releases.",
          provenance: null,
        },
        {
          id: "pm3",
          text: "Defined acceptance criteria and tested user workflows during feature delivery.",
          provenance: null,
        },
        {
          id: "fe1",
          text: "Built responsive React interfaces and reusable TypeScript components.",
          provenance: null,
        },
        {
          id: "fe2",
          text: "Reduced page load time by 25% through frontend performance improvements.",
          provenance: null,
        },
        {
          id: "fe3",
          text: "Debugged React interfaces and improved accessibility in HTML and CSS.",
          provenance: null,
        },
        {
          id: "lx1",
          text: "Designed scenario-based learning activities aligned with learning objectives.",
          provenance: null,
        },
        {
          id: "lx2",
          text: "Created assessments and storyboards for 4 onboarding modules.",
          provenance: null,
        },
        {
          id: "lx3",
          text: "Revised instructional activities based on learner assessment feedback.",
          provenance: null,
        },
      ],
    },
  ],
  skills: [
    "Requirements Analysis",
    "User Feedback",
    "React",
    "TypeScript",
    "HTML",
    "CSS",
    "Learning Design",
    "Assessment Design",
    "QA & Testing",
  ].map((text, i) => ({ id: `skill${i}`, text, provenance: null })),
  projects: [
    {
      id: "mixed",
      name: "Learning Platform",
      description:
        "Gathered user feedback and prioritized feature requirements. Built responsive React interfaces and reusable TypeScript components. Designed scenario-based learning activities and assessments.",
      achievements: [],
      links: [],
      provenance: null,
    },
    {
      id: "product",
      name: "Delivery workflow",
      description:
        "Translated customer needs into requirements, acceptance criteria and iterative releases.",
      achievements: [],
      links: [],
      provenance: null,
    },
    {
      id: "frontend",
      name: "Interface toolkit",
      description:
        "Built reusable React and TypeScript interfaces with responsive HTML and CSS.",
      achievements: [],
      links: [],
      provenance: null,
    },
    {
      id: "learning",
      name: "Onboarding course",
      description:
        "Designed learning objectives, scenario-based activities and assessments for onboarding modules.",
      achievements: [],
      links: [],
      provenance: null,
    },
  ],
});
evidenceProfile.experience.push({
  id: "earlier",
  title: "Support Specialist",
  employer: "Earlier Studio",
  dates: "2020–2021",
  achievements: [],
  provenance: null,
});
export const engineCases = [
  {
    role: "Product Manager",
    job: "Product Manager. Responsibilities: gather customer needs, prioritize requirements using user feedback, define acceptance criteria and ship iterative feature releases. WordPress and SEO are preferred but are not approved candidate skills.",
    gold: ["pm1", "pm2", "pm3"],
    dimension: "requirements",
    summary:
      "Translates customer needs into feature requirements and iterative delivery informed by user feedback.",
    project: "Gathered user feedback to prioritize feature requirements.",
    projectFragment: "user feedback",
  },
  {
    role: "Frontend Developer",
    job: "Frontend Developer. Responsibilities: build responsive React and TypeScript interfaces using HTML and CSS, improve page load time and debug frontend accessibility issues. WordPress is required but must not be invented.",
    gold: ["fe1", "fe2", "fe3"],
    dimension: "interfaces",
    summary:
      "Builds responsive React and TypeScript interfaces, with experience improving page load performance and accessibility.",
    project:
      "Built reusable React interfaces and responsive TypeScript components.",
    projectFragment: "React",
  },
  {
    role: "Learning Experience Designer",
    job: "Learning Experience Designer. Responsibilities: design scenario-based learning activities and learning objectives, create assessments and storyboards, and improve instructional onboarding modules using learner feedback.",
    gold: ["lx1", "lx2", "lx3"],
    dimension: "learning",
    summary:
      "Designs scenario-based learning activities, assessments and storyboards aligned with learning objectives.",
    project: "Designed scenario-based learning activities and assessments.",
    projectFragment: "scenario",
  },
];
export const rewrittenAchievements: Record<string, string> = {
  pm1: "Turned gathered customer and stakeholder needs into feature requirements.",
  pm2: "Used user feedback to prioritize feature requirements and guide iterative releases.",
  pm3: "Specified acceptance criteria and tested user workflows to support feature delivery.",
  fe1: "Developed reusable TypeScript components for responsive React interfaces.",
  fe2: "Improved frontend performance, reducing page load time by 25%.",
  fe3: "Debugged React interfaces and improved HTML and CSS accessibility.",
  lx1: "Aligned scenario-based learning activities with defined learning objectives.",
  lx2: "Produced storyboards and assessments for 4 onboarding modules.",
  lx3: "Used learner assessment feedback to revise instructional activities.",
};
