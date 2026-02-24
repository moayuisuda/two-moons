// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { aiApi, authErrorMiddleware } from "@/services/api";
import { AIResponse } from "@/typings/response";
import _ from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AIResponse>
) {
  const { messages, temperature = 0.95 } = req.body;

  let result;
  try {
    const response = await aiApi.post(
      "/v4/chat/completions",
      {
        model: "glm-4.5-air",
        temperature,
        messages,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers["authorization-ai"],
        },
      }
    );

    const { content } = response.choices[0].message;
    result = content;
  } catch (e) {
    if (!authErrorMiddleware(e)) {
      res.status(401).json({ error: "USER NOT LOGIN" });
      return;
    }
    result = {
      role: "temp",
      content: "Mooner 没有回应你的问题，请重试",
    };
  }

  res.status(200).json(result);
}
