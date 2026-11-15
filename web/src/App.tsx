// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Platform } from "./Platform";
import { Welcome } from "./welcome/Welcome";

/** The file of the platform, as the browser hands it over. */
interface PlatformFile {
  Platform: typeof Platform;
}

/**
 * Call a function when the browser has painted the document as it stands now, which is at the frame after the
 * next one. The function that is returned withdraws the call.
 */
function afterPaint(call: () => void): () => void {
  let frame = window.requestAnimationFrame(() => {
    frame = window.requestAnimationFrame(call);
  });
  return () => {
    window.cancelAnimationFrame(frame);
  };
}

/**
 * Answer a file of the platform that did not arrive: load the page again, once, because some browsers do not
 * fetch again a file that has failed. A page that was loaded again already keeps its welcome screen. The promise
 * never resolves, so React keeps waiting for the platform in both cases.
 */
function loadPageAgain(): Promise<never> {
  const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (navigation?.type !== "reload") {
    window.location.reload();
  }
  return new Promise<never>(() => undefined);
}

/**
 * Make the page of the application for one way of fetching the file of the platform. The site uses `App`, and a
 * test gives its own way.
 *
 * The welcome screen covers the page when it opens, and the first script of the site holds nothing else. The
 * platform is a file of its own. The browser is asked for it when the welcome screen has been painted, so it
 * arrives while the visitor reads.
 *
 * The platform is never drawn while the welcome screen slides away, because the start of the map and of the panes
 * would take time from the slide. It is drawn when the entrance of the screen has ended. For a visitor who enters
 * before that, or before the file has arrived, it is drawn first and the browser paints it, and only then does
 * the screen start to slide. The screen stays as it is until then.
 */
export function createApp(load: () => Promise<PlatformFile>) {
  const LazyPlatform = lazy(() => load().then((file) => ({ default: file.Platform }), loadPageAgain));

  return function App() {
    // Whether the page is wanted under the screen: the entrance has ended, or the visitor has pressed the screen.
    const [wanted, setWanted] = useState(false);
    // Whether the elements of the platform stand in the document.
    const [mounted, setMounted] = useState(false);
    // Whether the browser has also painted them, so that the screen may lift and slide away over them.
    const [standing, setStanding] = useState(false);
    const want = useCallback(() => setWanted(true), []);
    const mount = useCallback(() => setMounted(true), []);

    // The file of the platform is asked for when the welcome screen has been painted. A file that does not arrive
    // is asked for again when the platform is drawn.
    useEffect(
      () =>
        afterPaint(() => {
          load().catch(() => undefined);
        }),
      [],
    );

    useEffect(() => {
      if (mounted) {
        return afterPaint(() => setStanding(true));
      }
    }, [mounted]);

    return (
      <>
        {wanted ? (
          <Suspense fallback={null}>
            <LazyPlatform onMounted={mount} />
          </Suspense>
        ) : null}
        <Welcome onSettled={want} standing={standing} />
      </>
    );
  };
}

/** The page of the application. */
export const App = createApp(() => import("./Platform"));
