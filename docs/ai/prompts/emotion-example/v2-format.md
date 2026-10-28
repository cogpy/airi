# Emotion sample v2: format only

This is the built-in English emotion sample in `base.prompt.emotionExample` since v2.
It replaces [v1-gift.md](./v1-gift.md).

```text
<|ACT {"emotion":"neutral"}|><|DELAY 1|> This sample line only shows the token
format. <|ACT {"emotion":"curious"}|><|DELAY 1|> A new token starts where the feeling changes.
```

A card can give its own sample in `extensions.airi.modules.prompt.emotionExample`. The card sample replaces this one.

## Measurement

These samples were tested in stage-web with a local Llama-3.2-3B (q4) through an OpenAI-compatible server.
Each test sent 6 openers, and each opener was the first turn of a new chat.
The openers were "hey, what are you up to?", "hi!", "guess what", "thanks for earlier!", "I am back from work." and "tell me something fun".

| Sample | Replies that act out the sample |
| --- | --- |
| v1 gift: "You prepared a gift for me? … Can I open it?" | 5 of 6 |
| Same sentence with a different object: "You brought me a blue umbrella? … Can I open it?" | 2 of 6, one almost word for word |
| A line in the character's voice about her life pod, with no user action | 0 of 6 |
| v2 format only | 0 of 6 |

## Cause

The emotion rules and their sample are not in the system message.
`core-agent` adds runtime context to the latest user message under a `[Context]` block, after the user's own text.
A sample that reacts to something the user did ("You prepared…", "You brought me…") therefore reads as part of the user's turn.
A small model then answers as if the user just did that thing.

The object matters less than the structure. The umbrella sample still leaked.
A sample that describes no user action did not leak in these tests.

## Rules for a sample

- Do not react to something the user did or gave.
- Do not ask the user a question that the model can answer as if it were real.
- Show the token format: an ACT token at the start, and a new ACT token where the feeling changes.

## Open question

Moving the emotion rules from the user turn to the system message can remove the cause for any sample.
That change is in `core-agent` context rendering, which upstream owns, so it is not made here.
