/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function parseTransactionWithAI(input: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract transaction details from this text: "${input}". 
      Current Date: ${new Date().toISOString()}.
      If the type is not clear, assume "expense".
      Valid categories: Food, Shopping, Transport, Bills, Health, Entertainment, Mobile, Social, Repair, Pet, Beauty, Home, Travel, Education, Income, Others.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ["expense", "income"] },
            category: { type: Type.STRING },
            note: { type: Type.STRING },
            date: { type: Type.STRING, description: "ISO 8601 date" }
          },
          required: ["amount", "type", "category"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI returned no results");
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return null;
  }
}
