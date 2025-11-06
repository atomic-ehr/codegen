using System.Net;
using System.Text;
using System.ComponentModel;
using System.Net.Http.Headers;

namespace CSharpSDK.Client;

public enum AuthMethods
{
    [Description("Basic")]
    BASIC,
}

public class AuthCredentials
{
    public required string Username { get; set; }
    public required string Password { get; set; }
}

public class Auth
{
    public required AuthMethods Method { get; set; }
    public required AuthCredentials Credentials { get; set; }
}

public class Client
{
    private HttpClient HttpClient;
    private string Url;

    public Client(string url, Auth auth)
    {
        var httpClient = new HttpClient();

        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(GetMethodValue(auth.Method), EncodeCredentials(auth.Credentials));

        this.HttpClient = httpClient;
        this.Url = url;
    }

    public async Task<string> GetInfo()
    {
        UriBuilder resourcePath = new(this.Url) { Path = "$version" };

        var httpClient = this.HttpClient;

        var response = await httpClient.GetAsync(resourcePath.Uri);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Server returned error: {response.StatusCode}");
        }

        return await response.Content.ReadAsStringAsync() ?? throw new Exception("");
    }

    public async Task<(Bundle<T>? result, string? error)> Search<T>(string? queryString) where T : Resource
    {
        UriBuilder resourcePath = new(this.Url) { Path = Helper.ResourceMap[typeof(T)] };

        if (queryString is not null)
        {
            resourcePath.Query = queryString;
        }

        try
        {
            var response = await this.HttpClient.GetAsync(resourcePath.Uri);

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"Server returned error: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();

            Bundle<T>? parsedContent = JsonSerializer.Deserialize<Bundle<T>>(content, Helper.JsonSerializerOptions);

            return (parsedContent, default);
        }
        catch (HttpRequestException error)
        {
            return (default, error.Message);
        }
    }

    public async Task<(T? result, string? error)> Read<T>(string id) where T : Resource
    {
        UriBuilder resourcePath = new(this.Url) { Path = Helper.ResourceMap[typeof(T)] };

        var httpClient = this.HttpClient;

        try
        {
            var response = await httpClient.GetAsync($"{resourcePath.Uri}/{id}");

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"Server returned error: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();

            T? parsedContent = JsonSerializer.Deserialize<T>(content, Helper.JsonSerializerOptions);

            return (parsedContent, default);
        }

        catch (HttpRequestException error)
        {
            return (default, error.Message);
        }
    }

    public async Task<(T? result, string? error)> Create<T>(T data) where T : Resource
    {
        UriBuilder resourcePath = new(this.Url) { Path = Helper.ResourceMap[typeof(T)] };

        string jsonBody = JsonSerializer.Serialize<T>(data, Helper.JsonSerializerOptions);

        HttpContent requestData = new StringContent(jsonBody, Encoding.UTF8, "application/json");

        try
        {
            var response = await this.HttpClient.PostAsync(resourcePath.Uri, requestData);

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"Server returned error: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();

            T? parsedContent = JsonSerializer.Deserialize<T>(content, Helper.JsonSerializerOptions);

            return (parsedContent, default);
        }

        catch (HttpRequestException error)
        {
            return (default, error.Message);
        }
    }

    public async Task<(T? result, string? error)> Delete<T>(string id) where T : Resource
    {
        UriBuilder resourcePath = new(this.Url) { Path = Helper.ResourceMap[typeof(T)] };

        var httpClient = this.HttpClient;

        try
        {
            var response = await httpClient.DeleteAsync($"{resourcePath.Uri}/{id}");

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"Server returned error: {response.StatusCode}");
            }

            if (response.StatusCode == HttpStatusCode.NoContent)
            {
                throw new HttpRequestException($"The resource with id \"{id}\" does not exist");
            }

            var content = await response.Content.ReadAsStringAsync();

            T? parsedContent = JsonSerializer.Deserialize<T>(content, Helper.JsonSerializerOptions);

            return (parsedContent, default);
        }

        catch (HttpRequestException error)
        {
            return (default, error.Message);
        }
    }

    public async Task<(T? result, string? error)> Update<T>(T resource) where T : Resource
    {
        UriBuilder resourcePath = new(this.Url) { Path = Helper.ResourceMap[typeof(T)] };

        string jsonBody = JsonSerializer.Serialize<T>(resource, Helper.JsonSerializerOptions);

        HttpContent requestData = new StringContent(jsonBody, Encoding.UTF8, "application/json");

        var httpClient = this.HttpClient;

        try
        {
            var response = await httpClient.PutAsync($"{resourcePath.Uri}/{resource.Id}", requestData);

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"Server returned error: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();

            T? parsedContent = JsonSerializer.Deserialize<T>(content, Helper.JsonSerializerOptions);

            return (parsedContent, default);
        }

        catch (HttpRequestException error)
        {
            return (default, error.Message);
        }
    }

    private string EncodeCredentials(AuthCredentials credentials)
    {
        byte[] credentialsBytes = System.Text.Encoding.UTF8.GetBytes($"{credentials.Username}:{credentials.Password}");

        return Convert.ToBase64String(credentialsBytes);
    }

    private string GetMethodValue(AuthMethods method)
    {
        var fieldInfo = method.GetType().GetField(method.ToString());

        if (fieldInfo == null)
        {
            return method.ToString();
        }

        var attributes = (DescriptionAttribute[])fieldInfo.GetCustomAttributes(typeof(DescriptionAttribute), false);

        return attributes.Length > 0 ? attributes[0].Description : method.ToString();
    }
}

public class MetaResponse
{
    public string? LastUpdated { get; set; }
    public string? CreatedAt { get; set; }
    public required string VersionId { get; set; }
}

public class Link
{
    public required string Relation { get; set; }
    public required string Url { get; set; }
}

public class Search
{
    public required string Mode { get; set; }
}

public class Entry<T>
{
    public required T Resource { get; set; }
    public required Search Search { get; set; }
    public required string FullUrl { get; set; }
    public required Link[] Link { get; set; }
}

public class ApiResourcesResponse<T>
{
    [JsonPropertyName("query-time")]
    public int? QueryTime { get; set; }

    public MetaResponse? Meta { get; set; }
    public string? Type { get; set; }
    public string? ResourceType { get; set; }
    public int? Total { get; set; }
    public Link[]? Link { get; set; }

    [JsonPropertyName("query-timeout")]
    public int? QueryTimeout { get; set; }
    public Entry<T>[]? Entry { get; set; }

    [JsonPropertyName("query-sql")]
    public object[]? QuerySql { get; set; }
}

public class Bundle<T> : Resource where T : Resource
{
    public BundleLink[]? Link { get; set; }
    public required string Type { get; set; }
    public BundleEntry[]? Entry { get; set; }
    public uint? Total { get; set; }
    public Signature? Signature { get; set; }
    public string? Timestamp { get; set; }
    public Identifier? Identifier { get; set; }

    public class BundleLink : BackboneElement
    {
        public required string Url { get; set; }
        public required string Relation { get; set; }
    }

    public class BundleEntryLink : BackboneElement
    {
        public required string Url { get; set; }
        public required string Relation { get; set; }
    }

    public class BundleEntrySearch : BackboneElement
    {
        public string? Mode { get; set; }
        public string? Score { get; set; }
    }

    public class BundleEntryRequest : BackboneElement
    {
        public required string Url { get; set; }
        public required string Method { get; set; }
        public string? IfMatch { get; set; }
        public string? IfNoneExist { get; set; }
        public string? IfNoneMatch { get; set; }
        public string? IfModifiedSince { get; set; }
    }

    public class BundleEntryResponse : BackboneElement
    {
        public string? Etag { get; set; }
        public required string Status { get; set; }
        public Resource? Outcome { get; set; }
        public string? Location { get; set; }
        public string? LastModified { get; set; }
    }

    public class BundleEntry : BackboneElement
    {
        public BundleEntryLink[]? Link { get; set; }
        public BundleEntrySearch? Search { get; set; }
        public string? FullUrl { get; set; }
        public BundleEntryRequest? Request { get; set; }
        public T? Resource { get; set; }
        public BundleEntryResponse? Response { get; set; }
    }
}