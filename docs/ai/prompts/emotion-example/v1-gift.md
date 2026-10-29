# Emotion sample v1: gift

This file keeps the built-in English emotion sample that `base.prompt.emotionExample` used until v2.

```text
<|ACT {"emotion":"surprised"}|><|DELAY 1|> Wow... You prepared a gift
for me? <|ACT {"emotion":"curious"}|><|DELAY 1|> Can I open it?
```

## Why it was replaced

In stage-web, the character often thanked the user for a gift that did not exist.
v2 replaces the sample. See [v2-format.md](./v2-format.md) for the measurement and the cause.
