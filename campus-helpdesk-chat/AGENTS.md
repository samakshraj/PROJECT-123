<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the five student screens as distinct TanStack routes inside the shared root StudentShell so navigation preserves the workspace.
- Keep the chatbot public; personal screen actions require the shared account provider and browser data queries protected by owner-scoped RLS.
- Create student profiles through the auth lifecycle trigger; only account owners may read or update profiles and reminders, and submit/read their tickets.
