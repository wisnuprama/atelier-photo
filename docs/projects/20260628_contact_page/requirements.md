# PRD: Contact Info

## Overview

Add a contact page displaying the owner's email address.

## Requirements

- Display email address prominently after the greeting message
- Display greeting message prominently
- Clickable mailto link
- Accessible and minimal design consistent with gallery aesthetic
- Keyboard navigable
- Mobile responsive

## Non-functional Requirements

- Use environment variables to get email address
- Use environment variables to get greeting message
- Use fallback greeting message "Get in Touch" if greeting message env variable is null or empty

## Layout

```
Desktop:

                              Get in Touch

                          hello@example.com


Mobile:

  Get in Touch

  hello@example.com
```

- Centered vertically and horizontally on desktop
- Full width on mobile with padding
- Greeting message in larger text
- Email as clickable mailto link
- Minimal spacing and typography
