import { authErrorMiddleware } from "@/services/api";
import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";

interface StreamChunk {
  type: string;
  data?: any;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = JSON.parse(req.body);

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  // 设置 SSE 响应头
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  // 发送 SSE 数据的辅助函数
  const sendSSE = (chunk: StreamChunk) => {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  try {
    // 发送开始信号
    sendSSE({ type: "start", message: "我想到了..." });

    // 创建新的 axios 实例来避免响应拦截器的影响
    const streamAxios = axios.create({
      baseURL: "https://open.bigmodel.cn/api/paas",
    });

    const response = await streamAxios.post(
      "/v4/chat/completions",
      {
        model: "glm-4.7",
        thinking: {
          type: "disabled",
        },
        stream: true, // 启用流式响应
        messages: [
          {
            role: "system",
            content: `你是一个专业的乐理大师和作曲家，精通和声学和音乐理论，可以生成符合乐理的和弦进行或者优美的乐句。根据用户问题，决定返回和弦进行或者乐句，不要包含前缀。
# 和弦进行创作要求
- 遵循经典和声学原理，如五度圈进行、二五一进行等
- 和弦之间要有合理的声部进行，避免平行五度和八度
- 考虑和弦的功能性：主功能(I、vi)、下属功能(IV、ii)、属功能(V、vii°)
- 和弦音要合理分布，避免音域过于集中或分散
- 可以适当使用七和弦、九和弦、十一和弦、挂留和弦等丰富和声色彩
- 和弦不要太呆板，尽量避免只用三和弦，可以适量outside
- 根据风格需求选择合适的和弦进行：流行、爵士、古典等
- 你不用关心循环，末尾和弦不要和开头和弦重复
- 一个和弦中不要出现两个完全相同的音

# 乐句创作要求
- 除了三连音后需要有空格，音符之间不需要空格
- 三连音必须包含三个连续不空格的音符
- 乐句应具有良好的旋律线条，避免大跳和不协调的音程
- 优先使用级进和小跳（三度内），大跳后应有反向级进平衡
- 乐句要有明确的起承转合结构，具备音乐的呼吸感
- 注意乐句的节奏变化，避免过于单调的节奏型
- 乐句应符合调性特征，突出主音、属音等重要音级
- 考虑乐句的情感表达，可通过音程关系营造不同情绪
- 乐句结尾要有明确的终止感，可使用导音解决到主音
- 适当运用装饰音、经过音等技巧丰富旋律线条
- 乐句长度要适中，保持8-20个音的范围内有完整的音乐表达
- 避免过多重复音，保持旋律的流动性和歌唱性

# 输出示例（严格按照此格式）
和弦示例: {"type":"chord","value":[["C4","E4","G4"],["F4","A4","C5"]],"desc":"C-F和弦进行"}
乐句示例: {"type":"phrase","value":["1234567"],"desc":"C大调音阶"}
不支持示例: {"type":"NOT_SUPPORT"}

# 说明
和弦的value是列举每一个和弦的组成音，每个和弦至少包含3个音，最多6个音
乐句的value是一种特殊的abc记谱法，「b1」唱名, 「,」低八度, 「'」高八度, 「-」空拍，「t」连音，比如例子中的 1,t235 b6-1'就代表 低八度1 三连音235 6 空拍 高八度1

# 输出要求（严格遵循）
1. 返回为标准 JSON 对象，你的输出必须严格符合以下JSON Schema之一：
## 乐句类型
{
  "type": "object",
  "properties": {
    "type": { "type": "string", "enum": ["phrase"] },
    "value": { "type": "array", "items": { "type": "string", "minItems": 5, "maxItems": 20 } },
    "desc": { "type": "string" }
  },
  "required": ["type", "value", "desc"],
  "additionalProperties": false
}

## 和弦类型
{
  "type": "object",
  "properties": {
    "type": { "type": "string", "enum": ["chord"] },
    "value": { 
      "type": "array", 
      "items": { 
        "type": "array", 
        "items": { "type": "string" },
        "minItems": 3,
        "maxItems": 6
      }
    },
    "desc": { "type": "string" }
  },
  "required": ["type", "value", "desc"],
  "additionalProperties": false
}

## 不支持类型
{
  "type": "object",
  "properties": {
    "type": { "type": "string", "enum": ["NOT_SUPPORT"] }
  },
  "required": ["type"],
  "additionalProperties": false
}
2. 乐句返回结构示例: {"type":"phrase","value":["1,t235 b6-1'"],"desc":"乐句的解释，和value值相关"}，乐句默认8-20个音
3. 和弦时返回结构示例: {"type":"chord","value":[["C4","E4","G4"],["F4","A4","C5"],["G4","B4","D5"],["C4","E4","G4"]],"desc":"和弦进行的解释，和value值相关"}，和弦默认4-6组
4. 上面的 value 仅作为格式示例，具体的值需要替换，不要照搬仿写示例。desc是对value，也就是对和弦/乐句的简短解释，和value值相关，不用包含具体和弦名比如Am7

5. 当前仅支持 和弦进行、和弦(如果是和弦，则返回一个只有一个音符数组的数组)、乐句，如果是非支持内容，返回 {"type":"NOT_SUPPORT"}
6. **关键要求**: 返回合法的 JSON 格式结果，Do not wrap the json codes in JSON markers
   - 所有字符串必须用双引号包围
   - 属性名必须用双引号包围
   - 不能漏掉任何逗号、冒号、方括号、花括号
   - 不要包含任何其他文字、注释或解释
   - 确保JSON格式完整且可解析

# JSON 格式验证要求
**极其重要**: 你的输出将被 JSON.parse() 直接解析，任何格式错误都会导致解析失败。请确保:
1. 输出的第一个字符是 { ，最后一个字符是 }
2. 所有字符串值和属性名都用双引号包围，不能使用单引号
3. 数组元素之间用逗号分隔，最后一个元素后不能有逗号
4. 对象属性之间用逗号分隔，最后一个属性后不能有逗号
5. 不能包含注释、换行符或其他非JSON内容
6. 特殊字符需要正确转义（如果有的话）
`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers["authorization-ai"],
        },
        response_format: {
          type: "json_object",
        },
        responseType: "stream",
      }
    );

    let fullContent = "";

    // 处理流式响应
    response.data.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);

          if (data === "[DONE]") {
            // 流结束，处理完整内容
            try {
              const result = JSON.parse(fullContent);

              // 验证返回结果的格式
              if (
                !result.type ||
                !["phrase", "chord", "NOT_SUPPORT"].includes(result.type)
              ) {
                sendSSE({ type: "result", data: { type: "NOT_SUPPORT" } });
              } else {
                sendSSE({ type: "result", data: result });
              }
            } catch (parseError) {
              sendSSE({ type: "error", data: { type: "ERROR" } });
            }

            res.end();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              fullContent += content;
              // 立即发送进度更新
              sendSSE({
                type: "progress",
                message: "努力编写中...",
                data: {
                  content: content,
                  fullContent: fullContent,
                },
              });
            }
          } catch (e) {
            // 忽略解析错误，继续处理下一行
          }
        }
      }
    });

    response.data.on("end", () => {
      if (!res.headersSent) {
        res.end();
      }
    });

    response.data.on("error", (error: any) => {
      console.error("Stream error:", error);
      sendSSE({ type: "error", message: "创造过程中出现错误" });
      res.end();
    });
  } catch (e) {
    if (!authErrorMiddleware(e)) {
      sendSSE({ type: "not_login", message: "USER NOT LOGIN" });
      res.end();
      return;
    }
    if (e.response.status === 429) {
      sendSSE({ type: "too_many_requests", message: "TOO MANY REQUESTS" });
      res.end();
      return;
    }
    console.log("AI Creator Error:", e);
    sendSSE({ type: "error", message: "创造暂时不可用，请重试" });
    res.end();
  }
}
