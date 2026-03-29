Here is a comprehensive, 50-step execution plan designed specifically for your AI coding agent (like Cursor, Claude, or Copilot). You can copy and paste this entire plan directly into your agent's context and instruct it to execute the steps sequentially.

🤖 Agent Execution Plan: Studio Redesign, Clerk Auth, & V5 Isolation
Phase 1: Authentication Migration (Clerk)
1. Install Clerk by running npm install @clerk/nextjs (or your package manager equivalent).
2. Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to the .env.local file.
3. Open app/layout.tsx and wrap the RootLayout children with the <ClerkProvider> component.
4. Create a middleware.ts file in the project root and configure clerkMiddleware() to protect the /studio(.*) and /api/export routes.
5. Delete the existing Supabase login page at app/login/page.tsx and its actions at app/login/actions.ts.
6. Create a new file at app/sign-in/[[...sign-in]]/page.tsx and implement Clerk's <SignIn /> component.
7. Create a new file at app/sign-up/[[...sign-up]]/page.tsx and implement Clerk's <SignUp /> component.
8. In app/page.tsx, replace the Supabase auth.getUser() check with Clerk's auth() to handle root redirection to /studio or /sign-in.
9. In app/actions/config.ts and app/api/export/route.ts, replace all instances of Supabase's getUser() with Clerk's auth().userId from @clerk/nextjs/server.
10. Create a SQL migration script (migrations/clerk_migration.sql) to change the user_id column type in the configurations and video_exports tables from UUID to TEXT, and drop the foreign key constraint tying it to auth.users. Also delete lib/supabase/client.ts and lib/supabase/server.ts (keep @supabase/supabase-js for service-role actions).

Phase 2: Global State & UI Prioritization (Zustand)
11. In lib/store.ts, change the default value of showWaterfall from true to false to prioritize the sheet music view.
12. In lib/store.ts, add new boolean state variables: showMidiTimeline (default false), showWaveformTimeline (default false), and showAnchorSidebar (default false).
13. In lib/store.ts, add setter functions for these new variables (setShowMidiTimeline, setShowWaveformTimeline, setShowAnchorSidebar).
14. Add these new boolean variables to the partialize array in lib/store.ts for localStorage persistence.
15. In app/studio/edit/[id]/page.tsx, import the new state variables from the store and conditionally wrap the <MidiTimeline> component in {showMidiTimeline && ...}.
16. In app/studio/edit/[id]/page.tsx, conditionally wrap the <WaveformTimeline> component in {showWaveformTimeline && ...}.
17. In app/studio/edit/[id]/page.tsx, conditionally wrap the <AnchorSidebar> component in {showAnchorSidebar && ...}.
18. Verify components/layout/SplitScreenLayout.tsx automatically expands the ScrollView to 100% height when the waterfall is hidden (ensure flex-grow properties are applied correctly).
19. Ensure the PianoKeyboard component in SplitScreenLayout.tsx is completely hidden or unmounted when showWaterfall is false.
20. Replicate all view toggles, conditional rendering, and layout simplifications in app/studio/demo/page.tsx.

Phase 3: Step-by-Step Upload Wizard
21. Create a new component components/studio/UploadWizard.tsx that receives the config object and upload handler functions as props.
22. In app/studio/edit/[id]/page.tsx, add a state variable const [wizardStep, setWizardStep] = useState(1).
23. In app/studio/edit/[id]/page.tsx, add a useEffect to auto-evaluate config on load: if !config.audio_url step 1; else if !config.midi_url step 2; else if !config.xml_url step 3; else step 4.
24. Modify the render block in app/studio/edit/[id]/page.tsx: if wizardStep < 4, return the <UploadWizard>, completely hiding the main editor.
25. Implement Step 1 (Audio): In UploadWizard, render a file input for WAV/MP3. Add a "Next" button disabled if !config.audio_url. On click, trigger setWizardStep(2).
26. Implement Step 2 (MIDI): In UploadWizard, render a file input for MIDI. Add a "Next" button disabled if !config.midi_url. On click, trigger setWizardStep(3).
27. Implement Step 3 (MusicXML): In UploadWizard, render a file input for XML. Add a "Finish" button disabled if !config.xml_url. On click, trigger setWizardStep(4).
28. Ensure the file upload logic (handlers passed from the parent) updates the config state immediately so the "Next" buttons in the wizard unlock reactively.
29. Style the UploadWizard component as a centered, clean, step-through modal against the dark background, clearly communicating progress (e.g., "Step 1 of 3").
30. Ensure SplitScreenLayout gracefully handles cases where audioUrl or xmlUrl might be null during the wizard steps without crashing.

Phase 4: Editor Interface Simplification
31. In the main editor header of app/studio/edit/[id]/page.tsx, delete the standalone WAV, XML, and MIDI upload buttons to declutter the UI.
32. Add a "Manage Files" button in the editor's header that calls setWizardStep(1) to let users re-enter the wizard and replace files.
33. In the main editor top navigation bar, create a "View Toggles" dropdown menu (using a native select, Radix, or custom UI dropdown).
34. Inside the "View Toggles" dropdown, add toggle switches for "Sidebar", "Waterfall", "MIDI Timeline", and "Audio Timeline" wired to their respective Zustand setters.
35. Move the ScoreControls component (which contains eye/glow/pop toggles) and the Music Font <select> inside an "Advanced Settings" collapsible menu to further simplify the top bar.
36. In components/score/AnchorSidebar.tsx, wrap the "Beat-level mapping" checkbox, subdivision select, and regenerate button in an "Advanced Mapping" <details> or accordion to front-load simplicity.
37. Ensure the flex layout in app/studio/edit/[id]/page.tsx allows the SplitScreenLayout container to expand dynamically when the sidebars/timelines are hidden.
38. Sync the "View Toggles" menu and "Advanced Settings" layout changes over to app/studio/demo/page.tsx.
39. In app/studio/demo/page.tsx, hardcode the equivalent of wizardStep to 4 to bypass the wizard completely since files are already mocked.

Phase 5: Echolocation V5 Exclusivity & Cleanup
40. Delete app/actions/ai.ts completely, as Gemini AI is no longer used for mapping. Remove @google/genai from package.json.
41. In lib/engine/AutoMapper.ts, delete the autoMapByNoteV4 function entirely.
42. In lib/engine/AutoMapper.ts, delete the autoMapMidiToScore (V3) function entirely.
43. Move the remaining getAudioOffset function from AutoMapper.ts to lib/engine/AutoMapperV5.ts, and delete the AutoMapper.ts file completely.
44. In components/score/AnchorSidebar.tsx, locate the V5Controls sub-component and delete the <select> dropdown that chooses between v3, v4, and v5.
45. In V5Controls, remove the selectedVersion state. Rename the mapping button to "Run Echolocation Map" and hardcode its onClick to trigger onAutoMapV5(chordThreshold).
46. Remove the onAutoMap and onAutoMapV4 props from the AnchorSidebar component interface and implementation.
47. In app/studio/edit/[id]/page.tsx, delete the handleAutoMap and handleAutoMapV4 functions entirely, and stop passing them to <AnchorSidebar />.
48. Repeat step 47 for app/studio/demo/page.tsx to strip V3/V4 handlers from the demo editor.
49. In lib/types.ts, remove the ai_anchors field from the SongConfig interface, and remove all logic addressing it in lib/services/configService.ts.
50. Run npx tsc --noEmit and npm run lint to ensure no dangling types, broken imports, or missing props remain after the refactoring. Fix any residual errors.