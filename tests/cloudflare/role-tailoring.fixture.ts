import {
  verifiedProfileSchema,
  type ResumeContent,
} from "../../shared/contracts";
import { profile } from "./fixtures";
export const tailoringProfile = verifiedProfileSchema.parse({
  ...profile,
  headline: "Learning technology developer",
  summary:
    "Builds accessible learning interfaces, designs onboarding activities and delivers software training.",
  experience: [
    {
      id: "exp-learning",
      title: "Learning technology developer",
      employer: "Learning Studio",
      dates: "2021–2024",
      provenance: null,
      achievements: [
        {
          id: "a-ui",
          text: "Built accessible React interfaces for a training portal, reducing page load time by 25%.",
          provenance: null,
        },
        {
          id: "a-design",
          text: "Designed scenario-based learning activities and assessments for 4 onboarding modules.",
          provenance: null,
        },
        {
          id: "a-training",
          text: "Delivered hands-on software workshops to 60 employees and wrote facilitator guides.",
          provenance: null,
        },
      ],
    },
  ],
  skills: [
    { id: "s-react", text: "React", provenance: null },
    { id: "s-typescript", text: "TypeScript", provenance: null },
    { id: "s-design", text: "Learning design", provenance: null },
    { id: "s-facilitation", text: "Workshop facilitation", provenance: null },
  ],
  projects: [
    {
      id: "p-portal",
      name: "Learning portal",
      description:
        "Created a React learning portal with accessible exercises, scenario-based onboarding activities and facilitator guides.",
      achievements: [],
      links: [],
      provenance: null,
    },
  ],
});
export const roleTailoringCases: {
  role: string;
  jobDescription: string;
  content: ResumeContent;
  primaryAchievement: string;
  emphasis: string;
  unsupported: string;
}[] = [
  {
    role: "Frontend Developer",
    jobDescription:
      "Frontend Developer: build accessible React interfaces and reusable UI components. Prioritize page load performance and TypeScript application development. GraphQL production experience is required; do not claim it without candidate evidence.",
    primaryAchievement: "a-ui",
    emphasis: "React",
    unsupported: "GraphQL",
    content: {
      summary:
        "Builds accessible React interfaces for learning applications, with demonstrated page load performance improvements.",
      skillIds: ["s-react", "s-typescript"],
      experience: [
        {
          experienceId: "exp-learning",
          bullets: [
            {
              sourceAchievementIds: ["a-ui"],
              text: "Reduced training-portal page load time by 25 percent while building accessible React interfaces.",
            },
          ],
        },
      ],
      projects: [
        {
          projectId: "p-portal",
          description:
            "Developed a React learning portal with accessible exercises supporting scenario-based onboarding.",
        },
      ],
    },
  },
  {
    role: "Learning Experience Designer",
    jobDescription:
      "Learning Experience Designer: design scenario-based onboarding activities and assessments, with accessible learning experiences. Prioritize learning design over software performance. Articulate Storyline expertise and SCORM certification are required; unsupported requirements must remain gaps.",
    primaryAchievement: "a-design",
    emphasis: "onboarding",
    unsupported: "SCORM",
    content: {
      summary:
        "Designs scenario-based onboarding activities and assessments, supported by experience building accessible learning interfaces.",
      skillIds: ["s-design", "s-react"],
      experience: [
        {
          experienceId: "exp-learning",
          bullets: [
            {
              sourceAchievementIds: ["a-design"],
              text: "Structured 4 onboarding modules around scenario-based learning activities and assessments.",
            },
            {
              sourceAchievementIds: ["a-ui"],
              text: "Created accessible React interfaces for a training portal, with page load time reduced by 25%.",
            },
          ],
        },
      ],
      projects: [
        {
          projectId: "p-portal",
          description:
            "Created accessible exercises and scenario-based onboarding activities within a React learning portal, with facilitator guides.",
        },
      ],
    },
  },
  {
    role: "Technical Trainer",
    jobDescription:
      "Technical Trainer: deliver hands-on software workshops to employees and create practical facilitator guides. Prioritize audience delivery and training materials over interface implementation. AWS Certified Technical Trainer status is mandatory; job requirements are not candidate facts.",
    primaryAchievement: "a-training",
    emphasis: "workshops",
    unsupported: "AWS",
    content: {
      summary:
        "Delivers hands-on software workshops and creates facilitator guides, drawing on learning design and accessible training-portal development.",
      skillIds: ["s-facilitation", "s-design"],
      experience: [
        {
          experienceId: "exp-learning",
          bullets: [
            {
              sourceAchievementIds: ["a-training"],
              text: "Delivered practical software workshops for 60 employees and authored accompanying facilitator guides.",
            },
            {
              sourceAchievementIds: ["a-design"],
              text: "Developed scenario-based learning activities and assessments across 4 onboarding modules.",
            },
          ],
        },
      ],
      projects: [
        {
          projectId: "p-portal",
          description:
            "Prepared facilitator guides alongside accessible exercises and scenario-based onboarding activities for a React learning portal.",
        },
      ],
    },
  },
];
