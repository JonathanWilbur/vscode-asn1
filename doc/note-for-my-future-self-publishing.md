# Note for my future self pertaining to publishing new versions

The `wildboar` publisher is associated with my personal GitHub account using my
lastname dot space email address. The correct user ID (which you will see in
the bar at the top of the Marketplace website if you hover over it) is a UUID
starting with `54e70768-4773-6137`.

To publish, log into Azure DevOps using "Microsoft Account," not "Default
Directory." I'm not even sure WTF that means. I did not need access to any
form of MFA that I didn't already have access to on my current devices. My
attempt to resurrect my old phones was a waste of time.

Log into the [`wildboarsoftware`](https://dev.azure.com/wildboarsoftware)
organization. I think the project literally does not matter. The `VSCE_PAT`
you use to publish a new version seems to have no relationship to a project
whatsoever. Just go to the person-gear icon on the top right and get a PAT
just as described
[here](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).

I manually published via the `vsce` CLI. Specifically, I ran

```bash
npm install --no-save @vscode/vsce
npx @vscode/vsce package
npx @vscode/vsce publish
```

The `npx @vscode/vsce publish` command asks for your PAT interactively. I just
pasted it into there. At first, I got output like this, and the command exited
with an error:

```
The Personal Access Token verification succeeded for the publisher 'wildboar'.
The Personal Access Token verification succeeded for the publisher 'wildboar'.
 ERROR  Password is required.
```

Then I ran it again, expecting to put in a new PAT scoped to "all
organizations" (because I read in a GitHub issue that that helped somebody),
and this time, it did not prompt me for a PAT at all and immediately succeeded
with output like this:

```
 INFO  Publishing 'wildboar.asn1 v1.0.0'...
 INFO  Extension URL (might take a few minutes): https://marketplace.visualstudio.com/items?itemName=wildboar.asn1
 INFO  Hub URL: https://marketplace.visualstudio.com/manage/publishers/wildboar/extensions/asn1/hub
 DONE  Published wildboar.asn1 v1.0.0.
```

I spent hours on trying to publish this new version under the assumption that I
had to get access to some ancient Azure DevOps project from 2018, but I guess
not.
