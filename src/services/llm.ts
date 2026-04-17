import { CreateMLCEngine, InitProgressReport, MLCEngine } from '@mlc-ai/web-llm'

let engine: MLCEngine | null = null

export async function initLLM(onProgress: (progress: InitProgressReport) => void) {
  if (!engine) {
    // Pre-check: fail fast with a clear message if WebGPU is unavailable
    if (!navigator.gpu) {
      throw new Error('WebGPU 미지원 환경입니다. GPU 드라이버를 최신으로 업데이트하거나, DirectX 12 / Vulkan 지원 여부를 확인해주세요.')
    }
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      throw new Error('WebGPU 어댑터를 찾을 수 없습니다. 앱을 재시작하거나 GPU 드라이버를 업데이트해주세요.')
    }

    engine = await CreateMLCEngine(
      'gemma-2b-it-q4f16_1-MLC',
      { initProgressCallback: onProgress },
    )
  }
}

export async function summarizeWithLLM(text: string, onUpdate?: (text: string) => void): Promise<string> {
  if (!engine) throw new Error('LLM Engine is not loaded yet')

  const prompt = `회의 내용을 분석하고, 핵심 주제와 결정 사항을 누락 없이 "개조식(Bullet points, 단답형/명사형 종결)"으로 요약하세요. 오직 요약 결과만 한국어로 출력하세요.\n\n[회의 녹취록]\n${text}`

  let finalResult = ''
  
  if (onUpdate) {
    const chunks = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      stream: true,
    })
    
    for await (const chunk of chunks) {
      finalResult += chunk.choices[0]?.delta.content || ''
      onUpdate(finalResult)
    }
  } else {
    const response = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    })
    finalResult = response.choices[0].message.content || ''
  }
  
  return finalResult
}
