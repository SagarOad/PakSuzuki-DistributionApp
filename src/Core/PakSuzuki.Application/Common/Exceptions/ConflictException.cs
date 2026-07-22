namespace PakSuzuki.Application.Common.Exceptions;

// e.g. retailer already blocked, order already approved, duplicate CNIC/NTN on registration.
public class ConflictException : Exception
{
    public ConflictException(string message) : base(message) { }
}
