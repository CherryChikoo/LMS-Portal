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

  if (!found) {
    return { name: `Unknown ${entityType}`, isResolved: false, isDeleted: false };
  }

  const isDeleted = found.isDeleted === true || found.status === 'deleted';
  return {
    name: isDeleted ? `${found.name} (Deleted)` : found.name,
    isResolved: true,
    isDeleted: isDeleted,
    rawData: found
  };
};
