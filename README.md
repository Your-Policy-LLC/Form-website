# Form-website

Embeddable insurance quote form for Your Policy agency websites.

One config per website produces one permanent embed snippet. A prospect picks
the lines of business they want quoted, leaves contact details, and the
submission is delivered to Slack as the system of record. There is no database
by design: the Slack message *is* the lead record, which is why the payload
carries everything (source site, referring page, consent text, timestamp)
rather than an ID that points somewhere else.

Setup and architecture notes land in the feature PR that follows this commit.
