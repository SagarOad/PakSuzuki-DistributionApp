namespace PakSuzuki.Application.Common.Exceptions;

// Thrown when e.g. a retailer tries to act on another retailer's order, or a
// distributor tries to approve a retailer outside their own portfolio.
public class ForbiddenAccessException : Exception
{
    public ForbiddenAccessException() : base("You do not have permission to perform this action.") { }
    public ForbiddenAccessException(string message) : base(message) { }
}
