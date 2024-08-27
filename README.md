# SlowTracker to wip.co helper

I want to use SlowTracker to track my tasks, but I also want to use wip.co to publish progress of my work. It helps me with the process, so I don't have to do it manually.

## How it works

If I want to publish my progress to wip.co, I need to add tag #wip to my task in SlowTracker.

Then the script will:
1. Fetch first task with #wip tag from SlowTracker.
2. Use OpenAI to translate all the wins to English.
3. Use AWS SES to send the email to my private email.
4. Remove #wip tag from the task in SlowTracker and add #wip-added tag.

## Deploy

```bash
zip -r9 auto-wip.zip .
aws lambda update-function-code \
       --function-name auto-wip \
       --zip-file fileb://auto-wip.zip \
       --profile auto-wip \
       --region eu-central-1
```

## Setup

```bash
cp .env.example .env
```

Fill in the `.env` file with your SlowTracker, OpenAI API keys, and email validated in AWS SES.

Create manually `auto-wip` lambda function in AWS console.

```bash
export $(grep -v '^#' .env | xargs)

aws lambda update-function-configuration --function-name auto-wip \
  --environment "Variables={SLOWTRACKER_API_KEY=$SLOWTRACKER_API_KEY,OPENAI_API_KEY=$OPENAI_API_KEY,FROM_EMAIL=$FROM_EMAIL,TO_EMAIL=$TO_EMAIL,TELEGRAM_API_ID=$TELEGRAM_API_ID,TELEGRAM_API_HASH=$TELEGRAM_API_HASH,TELEGRAM_SESSION_ID=$TELEGRAM_SESSION_ID}" \
  --profile auto-wip \
  --timeout 30 \
  --region eu-central-1

aws iam put-role-policy --role-name $ROLE_NAME --policy-name $POLICY_NAME --policy-document file://<(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "arn:aws:ses:$REGION:$(aws sts get-caller-identity --profile $PROFILE --query Account --output text):identity/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

Finally, in AWS console, add a trigger EventBridge (CloudWatch Events) to the lambda function to trigger it, e.g. every day at 8:00 UTC.
