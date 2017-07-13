https://revel.github.io
https://github.com/pilu/traffic

- Enter a URL
- Select Content
  - Displays of the page screenshot
  - Shows list of content to select
  - Can select multiple pieces of content, name it
  - Can move up the selector stack to collect more content
  - Filter text
- Select Frequency
  - 15 minutes (paid)
  - 1 hour (paid)
  - 6 hours (default, free)
- API Endpoint
  - Endpoint
  - Random key
  - CURL command
  - Management link
- Webhook on content change (paid)
  - GET, POST
  - URL
  - Username, Password
- Payment
  - Enter email and password
  - Stripe credit card


Payment options:
1 month, non-recurring $5
Monthly, recurring $2.50/mo

- SMS on Content Change
- Email on Content Change

Data Model

Grabber
{
  url: string
  name: string
  status: string (success, failing)
  frequency_minutes: integer
  unique_key: string
  access_token: string
  webhook_method
  webhook_url
  webhook_username
  webhook_password
}

PageSource
{
  grabber_id: integer
  html: text
}

Selectors
{
  grabber_id: integer
  selector_strings: json
  name: string
}

Grab
{
  grabber_id: integer
  created_at: datetime
}

GrabValue
{
  grab_id: integer
  selector_id: integer
  value: string
}

User
{
  email: string
  password_encrypted: string

  stripe_values?
}

- Message Passing
  - Rabbit MQ
  - Queues:
    - phantom_request
      - initial_grab_request
        { request_token: <string>, url: <string> }
      - value_grab_request
    - phantom_response
      - initial_grab_response
        { request_token: <string>, url: <string>, selectors: [array<object>], preview_image: <blob> }
      - value_grab_response

- Phantom
  - Initial Grab
    - X Input: (string) URL
    - X Output: (json) Selector strings with content and image blob
  - Value Grab
    - X Input: (string) URL
               (json) Selector strings
    - X Output: (json) Values, Response Status
- Scheduler
  - Makes periodic requests based on request durations
    - Input: (database)
    - Output: Requests to Phantom
- Hooker
  - Makes periodic requests on value changes
    - Input: (database)
    - Output: Webhooks
- API
- Front





