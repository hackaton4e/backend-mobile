import express from 'express';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import dotenv from "dotenv";

dotenv.config();
const app = express();
const port = 3000;

app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// In-memory session store (for demonstration purposes)
const sessions = new Map();

// --- Mock LangSmith Tracing Middleware ---
const mockLangSmithMiddleware = (req, res, next) => {
    req.traceId = uuidv4(); // Generate a unique trace ID for each request
    console.log(`[Trace ID: ${req.traceId}] Starting new request.`);
    next();
};
app.use(mockLangSmithMiddleware);

// Helper function to simulate trace steps
const traceStep = (traceId, stepName, metadata = {}) => {
    console.log(`[Trace ID: ${traceId}] [Step: ${stepName}]`, JSON.stringify(metadata));
};

// --- Chat POST Route ---
app.post('/chat', async (req, res) => {
    const { userId, message } = req.body;
    const traceId = req.traceId;

    traceStep(traceId, 'request_received', { userId, message });

    if (!userId || !message) {
        traceStep(traceId, 'input_validation_failed', { reason: 'Missing userId or message' });
        // 13. Add a fallback response when input is incomplete or malformed.
        return res.status(400).json({
            text: "Please provide both 'userId' and 'message' in your request.",
            trace: [{ step: 'input_validation_failed', reason: 'Missing userId or message' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        });
    }

    // 9. Handle session context in-memory to preserve chat history across turns.
    if (!sessions.has(userId)) {
        traceStep(traceId, 'new_session_created', { userId });
        sessions.set(userId, {
            history: [
                { role: 'system', content: 'You are a helpful and friendly assistant. Keep your responses concise and relevant to the user\'s queries. Always try to clarify ambiguous requests.' }
            ] // 11. Use system prompts in the OpenAI API call
        });
    }

    const session = sessions.get(userId);
    session.history.push({ role: 'user', content: message });
    traceStep(traceId, 'user_message_added_to_history', { message });

    let assistantResponse = {
        text: "I'm sorry, I couldn't process your request at the moment. Please try again later.",
        trace: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };

    try {
        // Simulate an OpenAI API failure or timeout for turn 5 for a specific user
        // 14. Simulate error handling (e.g., OpenAI API failure or timeout).
        if (userId === 'user123' && session.history.length === 5) { // Assuming 5 messages for user123 implies turn 3 (system + 2 user + 2 assistant)
            traceStep(traceId, 'simulating_api_error', { userId, turn: session.history.length / 2 });
            throw new Error('Simulated OpenAI API timeout or internal server error.');
        }

        traceStep(traceId, 'calling_openai_model', { model: 'gpt-4o' });
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Using gpt-4o as an example
            messages: session.history,
            temperature: 0.7,
            max_tokens: 150,
        });
        traceStep(traceId, 'openai_model_responded', { completion });

        const assistantMessage = completion.choices[0].message.content;
        const usage = completion.usage;

        // 18. Include an if/else logic branch for adaptive assistant behavior.
        if (assistantMessage.toLowerCase().includes("clarify") || assistantMessage.toLowerCase().includes("ambiguous")) {
            traceStep(traceId, 'adaptive_behavior_clarifying_question');
            assistantResponse.text = assistantMessage; // Assume the model generated a clarifying question
        } else if (message.toLowerCase().includes("help") && session.history.length <= 4) { // Early turns for general help
            traceStep(traceId, 'adaptive_behavior_early_help_response');
            assistantResponse.text = `Welcome! How can I assist you with ${message.toLowerCase().includes("product") ? "our products" : "your query"}?`;
        }
        else {
            assistantResponse.text = assistantMessage;
        }

        session.history.push({ role: 'assistant', content: assistantResponse.text });
        traceStep(traceId, 'assistant_message_added_to_history', { message: assistantResponse.text });

        // 15. Estimate and return token usage from the API's `usage` field.
        assistantResponse.usage = {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        };
        traceStep(traceId, 'token_usage_recorded', assistantResponse.usage);

        // 10. Format each assistant response with `text`, `trace`, and `usage`.
        assistantResponse.trace.push({ step: 'openai_model_called', metadata: { model: 'gpt-4o', prompt_tokens: usage.prompt_tokens } });
        assistantResponse.trace.push({ step: 'assistant_response_generated' });


    } catch (error) {
        traceStep(traceId, 'openai_api_error', { error: error.message, stack: error.stack });
        assistantResponse.text = `I encountered an issue processing your request: ${error.message}. Please try again.`;
        assistantResponse.trace.push({ step: 'openai_api_failure', error: error.message });
    }

    res.json(assistantResponse);
});

app.listen(port, () => {
    console.log(`Chatbot server listening at http://localhost:${port}`);
});