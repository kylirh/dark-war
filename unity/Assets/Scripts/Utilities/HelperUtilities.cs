using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public static class HelperUtilities
{
    /// <summary>
    /// Empty string debug check
    /// </summary>
    public static bool ValidateCheckEmptyString(Object thisObject, string fieldName, string stringToCheck)
    {
        if (stringToCheck == "")
        {
            Debug.Log(fieldName " is empty and must contain a value in object " + thisObject.name.toString());
            return true;
        }

        return false;
    }
}
