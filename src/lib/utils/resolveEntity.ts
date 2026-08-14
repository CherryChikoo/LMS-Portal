export const resolveEntity = (entitiesArray: any[], targetId: string | number | null | undefined, entityType = "Entity") => {
  if (targetId === null || targetId === undefined || targetId === "") {
    return { name: `Select ${entityType}`, isResolved: false, isDeleted: false };
  }
  
  if (!entitiesArray) {
    return { name: "Loading...", isResolved: false, isLoading: true };
  }

  const targetStr = String(targetId).trim().toLowerCase();

  let found = entitiesArray.find(item => 
    String(item?.id || item?._id || item?.uid).trim().toLowerCase() === targetStr
  );

  if (!found) {
    found = entitiesArray.find(item => 
      String(item?.name || item?.title || "").trim().toLowerCase() === targetStr
    );
  }

  if (!found && entityType === "Institution") {
    const cleanSlug = (v?: string) => (v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "");
    const targetSlug = cleanSlug(targetStr);
    if (targetSlug) {
      found = entitiesArray.find(item =>
        cleanSlug(item?.id) === targetSlug || cleanSlug(item?.name) === targetSlug
      );
    }
  }

  if (!found) {
    const rawStr = String(targetId).trim();
    const isInternalId = /^(batch|col|stud|exam|res|user|usr|att)-/i.test(rawStr) || 
      ((rawStr.length === 20 || rawStr.length === 28 || rawStr.length === 36) && !rawStr.includes(" "));
    
    let displayName = rawStr;
    if (isInternalId) {
      if (entityType === "Batch") displayName = "Unassigned Batch";
      else if (entityType === "Institution") displayName = "Unassigned";
      else displayName = `Unassigned ${entityType}`;
    }
    return { name: displayName, isResolved: !isInternalId, isDeleted: false };
  }

  const isDeleted = found.isDeleted === true || found.status === 'deleted';
  return {
    name: isDeleted ? `${found.name} (Deleted)` : found.name,
    isResolved: true,
    isDeleted: isDeleted,
    rawData: found
  };
};
