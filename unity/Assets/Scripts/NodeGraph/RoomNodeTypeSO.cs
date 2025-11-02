using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class RoomNodeTypeSO : ScriptableObject
{
    public string roomNodeTypeName;
    
    #region Header
    [Header("Only flag the RoomNodeTypes that should be visible in the editor")]
    #endregion
    public bool displayInNodeGraphEditor = true;
    
    #region Header
    [Header("One type should be a Corridor")]
    #endregion
    public bool isCorridor = true;
    
    #region Header
    [Header("One type should be a CorridorNS")]
    #endregion
    public bool isCorridorNS = true;
    
    #region Header
    [Header("One type should be a CorridorEW")]
    #endregion
    public bool isCorridorEW = true;
    
    #region Header
    [Header("One type should be an Entrance")]
    #endregion
    public bool isEntrance = true;
    
    #region Header
    [Header("One type should be an BossRoom")]
    #endregion
    public bool isBossRoom = true;
    
    #region Header
    [Header("One type should none or Unassigned")]
    #endregion

    public bool isNone;

    #region Validation
    #if UNITY_EDITOR
    private void OnValidate()
    {
        HelperUtilities.ValidateCheckEmptyString(this, nameof(roomNodeTypeName), roomNodeTypeName)
    }
    #endif
    #endregion
}
