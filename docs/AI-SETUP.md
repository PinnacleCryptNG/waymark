# Switching on Gemini

WAYMARK works without AI, using built-in rules. With Gemini switched on, it understands looser speech,
such as Pidgin ("abeg send Musa 5k") or sentences in an unexpected order.

It takes about 10 minutes, in a web browser, with no coding. There are three parts:

1. Get a Gemini key from Google.
2. Put the key on a small free Cloudflare server.
3. Send Claude the server's address. The address is not a secret.

**Never paste the key into a chat, an email or the WAYMARK code.** It only goes into Cloudflare, in step 2.

## 1. Get a Gemini key

1. Go to **aistudio.google.com** and sign in with a Google account.
2. Choose **Get API key**, then **Create API key**.
3. Copy the key and keep it somewhere private for a few minutes.

On the free tier, Google may use what is sent to improve its products. That is acceptable for this demo,
because every name and amount is invented. A real bank would use a paid account or Google Cloud's
enterprise terms.

## 2. Create the server on Cloudflare

1. Go to **dash.cloudflare.com** and create a free account (or sign in).
2. Open **Workers & Pages**, then **Create**, then **Create Worker**.
3. Name it `waymark-interpreter` and choose **Deploy**. This deploys a "Hello World" placeholder.
4. Choose **Edit code**. Delete everything in the editor.
5. Paste in the whole of `server/gemini-worker.js` from the WAYMARK repository. On GitHub, open the
   file, choose **Raw**, select all and copy.
6. Choose **Deploy**.
7. Go back to the Worker, open **Settings**, then **Variables and Secrets**, and add these two:
   - Type **Secret**, name `GEMINI_API_KEY`, value: your key from step 1.
   - Type **Text**, name `ALLOWED_ORIGINS`, value: `https://pinnaclecryptng.github.io`
8. Choose **Deploy** (or **Save**).
9. Copy the Worker's address. It looks like `https://waymark-interpreter.<your-name>.workers.dev`.

## 3. Switch it on in WAYMARK

Send Claude the Worker address from step 2.9. Claude puts it in `app/config.js` and pushes. The live demo
then uses Gemini. The Talk screen and Help say that Gemini is in use.

## What Gemini can and cannot do here

- **It receives only the sentence that was heard and the names of the demo banks.** Balances, saved payees
  and account history never leave the phone. The payee name Gemini hears is matched on the phone.
- **It never moves money.** It returns a request, such as "pay Musa 5,000 naira". WAYMARK checks that
  request with its own rules, reads back the bank's own figures, and sends only after a tap and a
  fingerprint.
- **"Yes" and "no" are never sent to Gemini.** They are handled on the phone.
- **If Gemini is slow (over 4 seconds), down or returns something odd, WAYMARK uses its built-in rules
  instead.** The user is never stuck.
- **Only the GitHub Pages site can call the server.** Other websites are refused.
- **To change the model,** add a Text variable `GEMINI_MODEL` with the model name. The default is
  `gemini-flash-lite-latest`, Google's always-current small, fast model.
- **To turn Gemini off,** remove the address from `app/config.js`, or delete the Worker.
