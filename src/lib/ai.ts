export type AiAssessment = {
  marks: number;
  grade: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  score: number;
};

const DEFAULT_GRADES = ['O', 'A+', 'A', 'B+', 'B', 'C', 'F'];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function marksToGrade(marks: number, maxMarks: number) {
  const pct = (marks / maxMarks) * 100;
  if (pct >= 90) return 'O';
  if (pct >= 80) return 'A+';
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B+';
  if (pct >= 50) return 'B';
  if (pct >= 40) return 'C';
  return 'F';
}

async function callOpenAI(prompt: string) {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert academic grader. Respond with JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI error: ${res.status} ${txt}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    return content ?? null;
  } catch (err) {
    console.error('OpenAI call failed', err);
    return null;
  }
}

export async function evaluateAssignment(opts: {
  assignmentTitle: string;
  courseName?: string;
  submissionText?: string; // plain text of submission when available
  maxMarks: number;
}): Promise<AiAssessment> {
  const { assignmentTitle, courseName = '', submissionText = '', maxMarks } = opts;

  const prompt = `Evaluate the following student submission and provide a JSON object only with these keys: marks (integer between 0 and ${maxMarks}), grade (one of O, A+, A, B+, B, C, F), score (0-100 integer), feedback (string), strengths (array of short strings), improvements (array of short strings).

Assignment Title: ${assignmentTitle}
Course: ${courseName}

Submission Text:\n${submissionText.substring(0, 4000)}\n\nRespond with JSON only.`;

  const aiResponse = await callOpenAI(prompt);

  if (aiResponse) {
    // try to extract JSON from AI response
    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');
    const jsonText = firstBrace !== -1 && lastBrace !== -1 ? aiResponse.slice(firstBrace, lastBrace + 1) : aiResponse;
    try {
      const parsed = JSON.parse(jsonText) as Partial<AiAssessment>;
      // normalize and ensure required keys
      const marks = clamp(Math.round(parsed.marks ?? Math.round((parsed.score ?? 50) / 100 * maxMarks)), 0, maxMarks);
      const score = clamp(Math.round(parsed.score ?? Math.round((marks / maxMarks) * 100)), 0, 100);
      const grade = parsed.grade ?? marksToGrade(marks, maxMarks);
      const feedback = parsed.feedback ?? (score >= 85 ? 'Excellent work' : score >= 70 ? 'Good work' : 'Needs improvement');
      const strengths = Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [];
      const improvements = Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 5) : [];

      return { marks, grade, feedback, strengths, improvements, score };
    } catch (err) {
      console.warn('Failed to parse AI JSON response, falling back to heuristic', err);
    }
  }

  // Fallback: simple heuristic/mock scoring
  const base = 75 + Math.floor(Math.random() * 20) - 10; // 65-85
  const marks = clamp(Math.round((base / 100) * maxMarks), 0, maxMarks);
  const score = clamp(base, 0, 100);
  const grade = marksToGrade(marks, maxMarks);
  const feedback = `AI evaluation (mock): estimated ${marks}/${maxMarks}. Review structure and add examples.`;
  const strengths = ['Clear structure', 'Relevant content'].slice(0, 2);
  const improvements = ['Add more examples', 'Cite sources'].slice(0, 2);

  return { marks, grade, feedback, strengths, improvements, score };
}
