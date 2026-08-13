/** Custom `dataTransfer` MIME type used when dragging a file row out of `FileTreeNode.tsx` — a
 *  workspace-relative path (`entry.path`'s own format, `/`-separated regardless of OS), read by
 *  `ChatInput.tsx`'s drop zone to attach that file as chat context. Deliberately not `text/plain`
 *  (which the file tree doesn't set at all) so this only ever matches an intentional in-app file
 *  drag, never an arbitrary OS text/file drag a browser's default handling might otherwise also
 *  populate. */
export const FILE_PATH_DRAG_MIME_TYPE = 'application/x-rasik-file-path'
