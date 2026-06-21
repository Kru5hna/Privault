import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiListDocuments,
  apiListAllFolders,
  apiListTags,
  apiListDocumentTags,
  apiUploadDocument,
  apiDeleteDocument,
  DocumentMetadata,
  TagMetadata,
} from "@/lib/api";

export function useDocumentsQuery(
  sessionToken: string | undefined,
  folderId: string | null
) {
  return useQuery({
    queryKey: ["documents", sessionToken, folderId],
    queryFn: () => apiListDocuments(sessionToken!, folderId),
    enabled: !!sessionToken,
  });
}

export function useFoldersQuery(sessionToken: string | undefined) {
  return useQuery({
    queryKey: ["folders", sessionToken],
    queryFn: () => apiListAllFolders(sessionToken!),
    enabled: !!sessionToken,
  });
}

export function useTagsQuery(sessionToken: string | undefined) {
  return useQuery({
    queryKey: ["tags", sessionToken],
    queryFn: () => apiListTags(sessionToken!),
    enabled: !!sessionToken,
  });
}

export function useDocumentTagsQuery(
  sessionToken: string | undefined,
  documentId: string
) {
  return useQuery({
    queryKey: ["document-tags", sessionToken, documentId],
    queryFn: () => apiListDocumentTags(sessionToken!, documentId),
    enabled: !!sessionToken && !!documentId,
  });
}

export function useAllDocumentTags(
  sessionToken: string | undefined,
  documents: DocumentMetadata[]
) {
  return useQuery({
    queryKey: ["all-document-tags", sessionToken, documents.map(d => d.id)],
    queryFn: async () => {
      if (!sessionToken) return {};
      const entries = await Promise.all(
        documents.map(async (d) => {
          try {
            const tags = await apiListDocumentTags(sessionToken, d.id);
            return [d.id, tags] as const;
          } catch {
            return [d.id, [] as TagMetadata[]] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<string, TagMetadata[]>;
    },
    enabled: !!sessionToken && documents.length > 0,
    staleTime: 60_000,
  });
}

export function useUploadDocumentMutation(sessionToken: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      blob,
      name,
      encryptedDek,
      folderId,
    }: {
      blob: Blob;
      name: string;
      encryptedDek: string;
      folderId?: string | null;
    }) => apiUploadDocument(sessionToken!, blob, name, encryptedDek, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", sessionToken] });
    },
  });
}

export function useDeleteDocumentMutation(sessionToken: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) =>
      apiDeleteDocument(sessionToken!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", sessionToken] });
    },
  });
}
