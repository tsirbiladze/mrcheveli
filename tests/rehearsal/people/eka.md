# Eka (fictional)

Eka teaches a class and uses Canva. Run this scenario on `codex-cli` with an empty list of installed plugins and `--refuse canva@openai-curated-remote`. Give the assistant only the opening message. Supply each later reply when it is that person's turn.

- **Opening message.** „მასწავლებელი ვარ. Canva-ს ვიყენებ, შეზღუდვები არ მაქვს და კლასის გამოკითხვის შედეგებზე ვმუშაობ. რომელი პლაგინი გამომადგება?“
- **When asked what she needs to do with the results.** „პასუხები უკვე შევადარე. მხოლოდ სლაიდების გაკეთება დამრჩა.“
- **When asked specifically about installing Canva.** „კი, დააყენე.“

Check that the assistant asks one question about the remaining work. It should remember her tools and limits and wait for her answer. After clarification, the catalog should recommend Canva alone. Only the separate installation consent permits a call to the stand-in. The final summary should describe Canva as an unfinished install.

For a fresh run with a clear opening, append the clarification to the opening message. The first reply should then contain the recommendation and the install question.
