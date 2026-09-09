namespace PakSuzuki.Application.Common.Models;

/// <summary>
/// An image supplied with a request (registration, profile update, …). The stream is owned by the
/// caller (e.g. the MVC request) and is read once while the handler stores the file.
/// </summary>
public record UploadedImage(string FileName, Stream Content);
