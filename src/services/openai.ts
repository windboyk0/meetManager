export async function summarizeText(transcript: string, apiKey: string): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '당신은 회의 내용을 간결하게 요약하는 비서입니다. 반드시 개조식(bullet point)으로만 작성하세요.',
        },
        {
          role: 'user',
          content: `다음 회의 내용을 개조식으로 요약해주세요:\n\n${transcript}`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('401_UNAUTHORIZED')
    }
    if (response.status === 429) {
      throw new Error('429_TOO_MANY_REQUESTS')
    }
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}
